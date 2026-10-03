import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppWindow, BarChart3, CheckCircle2, CircleDot, Filter, Gauge, GripVertical, LayoutDashboard,
  ChevronDown, ChevronRight, Pencil, Plus, RefreshCw, Search, Table2, TextCursorInput, UserCheck, Workflow,
} from 'lucide-react'
import { apiRequest } from '../../services/api'
import DashboardBuilder from '../dashboard/DashboardBuilder.jsx'
import CustomReportsAdmin from '../reports/CustomReportsAdmin.jsx'
import WorkflowAdmin, { FLOW_TYPE_OPTIONS } from './Platform/WorkflowAdmin.jsx'
import ApprovalProcessBuilder from './Platform/ApprovalProcessBuilder.jsx'
import CustomPageBuilder from './Platform/CustomPageBuilder.jsx'
import Builder2Page from '../developer/Builder2Page.jsx'

const TABS = [
  { key: 'workflow', label: 'Workflow', icon: Workflow },
  { key: 'approval', label: 'Approval Flow', icon: UserCheck },
  { key: 'page', label: 'Page Builder', icon: AppWindow },
  { key: 'dashboard', label: 'Dashboard Builder', icon: LayoutDashboard },
  { key: 'report', label: 'Report Builder', icon: BarChart3 },
]

const APPROVAL_STRUCTURAL_COMPONENTS = [
  { key: 'criteria', label: 'Entry criteria', category: 'Approval', icon: Filter },
  { key: 'approver', label: 'Approver step', category: 'Approval', icon: UserCheck },
  { key: 'submission_action', label: 'Submission action', category: 'Actions', icon: CheckCircle2 },
  { key: 'approval_action', label: 'Approval action', category: 'Actions', icon: CheckCircle2 },
  { key: 'rejection_action', label: 'Rejection action', category: 'Actions', icon: CircleDot },
]

function normalizeRegistry(input) {
  const rows = Array.isArray(input) ? input : []
  return rows.map((row) => ({
    ...row,
    key: row.key || row.component_key || row.componentKey || row.name,
    label: row.displayName || row.display_name || row.label || row.title || row.name || row.key,
    category: row.category || row.kind || 'Component',
  })).filter((row) => row.key)
}

function responseRows(response) {
  const data = response?.data
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.rows)) return data.rows
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.definitions)) return data.definitions
  return []
}

function isWorkflowRule(rule) {
  const action = rule?.action || {}
  return String(action?.type || '').toLowerCase() === 'workflow' || Array.isArray(action?.actions)
}

function builderSupports(component, builder) {
  const supported = component.supportedBuilders || component.supported_builders || component.builders || []
  const values = Array.isArray(supported) ? supported : supported ? [supported] : []
  if (!values.length) return builder === 'dashboard'
  return values.map((value) => String(value).toUpperCase()).includes(builder.toUpperCase())
}

function safeKey(value, fallback = 'item') {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return cleaned || fallback
}

function BuilderNode({ item, index, selected, onSelect, onRemove }) {
  return (
    <button type="button" className={`onebuilder-node ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <GripVertical size={15} />
      <div><small>{index === 0 ? 'Start' : `Step ${index + 1}`}</small><strong>{item.label || item.key}</strong></div>
      <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); onRemove() }}>×</span>
    </button>
  )
}

function SchemaPropertyEditor({ name, spec = {}, value, fields = [], onChange }) {
  const type = spec.type || 'string'
  const label = spec.title || name.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase())
  if (type === 'boolean') return <label className="onebuilder-schema-toggle"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)}/> {label}</label>
  if (type === 'number' || type === 'integer') return <label>{label}<input type="number" step={type === 'integer' ? '1' : 'any'} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}/></label>
  if (Array.isArray(spec.enum)) return <label>{label}<select value={value ?? ''} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{spec.enum.map((option) => <option key={String(option)} value={option}>{String(option)}</option>)}</select></label>
  if (type === 'object') {
    if (name === 'fieldValues' && fields.length) {
      return <label>{label}<textarea rows="7" placeholder="Use JSON field mappings, e.g. { &quot;status&quot;: &quot;OPEN&quot; }" value={value && typeof value === 'object' ? JSON.stringify(value, null, 2) : ''} onChange={(e) => { try { onChange(e.target.value.trim() ? JSON.parse(e.target.value) : {}) } catch {} }}/><small>{fields.map((field) => field.api_name).slice(0, 12).join(', ')}</small></label>
    }
    return <label>{label}<textarea rows="7" value={value && typeof value === 'object' ? JSON.stringify(value, null, 2) : ''} onChange={(e) => { try { onChange(e.target.value.trim() ? JSON.parse(e.target.value) : {}) } catch {} }}/></label>
  }
  if (type === 'array') return <label>{label}<textarea rows="5" value={Array.isArray(value) ? JSON.stringify(value, null, 2) : ''} onChange={(e) => { try { onChange(e.target.value.trim() ? JSON.parse(e.target.value) : []) } catch {} }}/></label>
  return <label>{label}<input value={value ?? ''} onChange={(e) => onChange(e.target.value)}/></label>
}


function GenericProperties({ item, fields = [], actionRegistry = [], roles = [], onChange }) {
  if (!item) return <span className="onebuilder-properties-empty">Select a node to configure it.</span>

  const patchConfig = (patch) => onChange({ ...item, config: { ...(item.config || {}), ...patch } })

  if (item.builderType === 'approval') {
    if (item.key === 'approver') {
      return <div className="onebuilder-properties-form"><label>Step label<input value={item.label || ''} onChange={(e) => onChange({ ...item, label: e.target.value })}/></label><label>Approver role<select value={item.config?.roleId || ''} onChange={(e) => patchConfig({ roleId: e.target.value })}><option value="">Select role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name || role.label}</option>)}</select></label></div>
    }
    if (item.key === 'criteria') {
      return <div className="onebuilder-properties-form"><label>Field<select value={item.config?.field || ''} onChange={(e) => patchConfig({ field: e.target.value })}><option value="">Select field</option>{fields.map((field) => <option key={field.api_name} value={field.api_name}>{field.label}</option>)}</select></label><label>Operator<select value={item.config?.operator || 'equals'} onChange={(e) => patchConfig({ operator: e.target.value })}>{['equals','not_equals','greater_than','less_than','is_empty','changed','changed_to'].map((operator) => <option key={operator}>{operator}</option>)}</select></label><label>Value<input value={item.config?.value ?? ''} disabled={item.config?.operator === 'is_empty'} onChange={(e) => patchConfig({ value: e.target.value })}/></label></div>
    }
    return <div className="onebuilder-properties-form"><label>Registered action<select value={item.config?.actionType || ''} onChange={(e) => patchConfig({ actionType: e.target.value })}><option value="">Select action</option>{actionRegistry.map((action) => <option key={action.key} value={action.key}>{action.label}</option>)}</select></label><label>Configuration<textarea rows="8" value={JSON.stringify(item.config?.actionConfig || {}, null, 2)} onChange={(e) => { try { patchConfig({ actionConfig: JSON.parse(e.target.value) }) } catch {} }}/></label></div>
  }

  if (item.builderType === 'report') {
    const fieldSelect = (label, key = 'field') => <label>{label}<select value={item.config?.[key] || ''} onChange={(e) => patchConfig({ [key]: e.target.value })}><option value="">Select field</option>{fields.map((field) => <option key={field.api_name} value={field.api_name}>{field.label}</option>)}</select></label>
    if (item.key === 'field') return <div className="onebuilder-properties-form">{fieldSelect('Field')}</div>
    if (item.key === 'group') return <div className="onebuilder-properties-form">{fieldSelect('Group by')}</div>
    if (item.key === 'filter') return <div className="onebuilder-properties-form">{fieldSelect('Field')}<label>Operator<select value={item.config?.operator || 'eq'} onChange={(e) => patchConfig({ operator: e.target.value })}>{['eq','neq','gt','gte','lt','lte','contains','in','is_null'].map((operator) => <option key={operator} value={operator}>{operator}</option>)}</select></label>{item.config?.operator !== 'is_null' ? <label>Value<input value={item.config?.value ?? ''} onChange={(e) => patchConfig({ value: e.target.value })}/></label> : null}</div>
    if (item.key === 'metric') return <div className="onebuilder-properties-form"><label>Metric<select value={item.config?.type || 'count'} onChange={(e) => patchConfig({ type: e.target.value })}>{['count','sum','avg','min','max'].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>{item.config?.type !== 'count' ? fieldSelect('Field') : null}</div>
    if (item.key === 'sort') return <div className="onebuilder-properties-form">{fieldSelect('Sort field')}<label>Direction<select value={item.config?.direction || 'asc'} onChange={(e) => patchConfig({ direction: e.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label></div>
    return <div className="onebuilder-properties-form"><label>Configuration<textarea rows="9" value={JSON.stringify(item.config || {}, null, 2)} onChange={(e) => { try { onChange({ ...item, config: JSON.parse(e.target.value) }) } catch {} }}/></label></div>
  }

  return <div className="onebuilder-properties-form"><label>Title<input value={item.label || ''} onChange={(e) => onChange({ ...item, label: e.target.value })}/></label><label>Configuration<textarea rows="10" value={JSON.stringify(item.config || {}, null, 2)} onChange={(e) => { try { onChange({ ...item, config: JSON.parse(e.target.value) }) } catch {} }}/></label></div>
}

export default function OneBuilder({ initialTab = 'workflow', singleBuilder = false, initialWorkflowId = '', onWorkflowOpen, onWorkflowClose }) {
  const [tab, setTab] = useState(initialTab)
  const [listQuery, setListQuery] = useState('')
  const [expandedWorkflowGroups, setExpandedWorkflowGroups] = useState({})
  const [componentRegistry, setComponentRegistry] = useState([])
  const [actionRegistry, setActionRegistry] = useState([])
  const [reportRegistry, setReportRegistry] = useState([])
  const [triggers, setTriggers] = useState([])
  const [objects, setObjects] = useState([])
  const [roles, setRoles] = useState([])
  const [fields, setFields] = useState([])
  const [saved, setSaved] = useState({ workflow: [], approval: [], dashboard: [], report: [] })
  const [selectedSavedId, setSelectedSavedId] = useState('')
  const [paletteSearch, setPaletteSearch] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [mode, setMode] = useState('list')
  const [workflowDraft, setWorkflowDraft] = useState(null)
  const [workflowNewDialogOpen, setWorkflowNewDialogOpen] = useState(false)
  const [workflowNewType, setWorkflowNewType] = useState('')
  const [workflowNewObjectKey, setWorkflowNewObjectKey] = useState('')
  const [sideTab, setSideTab] = useState('components')
  const [canvas, setCanvas] = useState({ workflow: [], approval: [], dashboard: [], report: [] })
  const [meta, setMeta] = useState({
    workflow: { name: '', objectId: '', triggerKey: '', active: false },
    approval: { name: '', objectId: '', active: false },
    dashboard: { name: '', description: '', apiKey: '' },
    report: { label: '', description: '', objectId: '', reportKey: '' },
  })
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const openedRouteWorkflowRef = useRef('')

  const loadBase = async () => {
    setLoading(true)
    setError('')
    try {
      const [components, actions, reportElements, triggerRes, objectRes, roleRes, ruleRes, approvalRes, dashboardRes, customReportRes] = await Promise.all([
        apiRequest('/api/platform/component-registry').catch(() => ({ data: [] })),
        apiRequest('/api/platform/workflow-actions').catch(() => ({ data: [] })),
        apiRequest('/api/platform/report-builder-registry').catch(() => ({ data: [] })),
        apiRequest('/api/platform/workflow-triggers').catch(() => ({ data: [] })),
        apiRequest('/api/platform/objects'),
        apiRequest('/api/platform/approval-roles').catch(() => ({ data: [] })),
        apiRequest('/api/platform/rules').catch(() => ({ data: [] })),
        apiRequest('/api/platform/approval-processes').catch(() => ({ data: [] })),
        apiRequest('/api/dashboards').catch(() => ({ data: [] })),
        apiRequest('/api/reports/custom').catch(() => ({ data: [] })),
      ])
      const objectRows = objectRes?.data?.objects || objectRes?.data || []
      setComponentRegistry(normalizeRegistry(components?.data?.components || components?.data || []))
      setActionRegistry(normalizeRegistry(actions?.data || []))
      setReportRegistry(normalizeRegistry(reportElements?.data || []))
      setTriggers(normalizeRegistry(triggerRes?.data || []))
      setObjects(Array.isArray(objectRows) ? objectRows.filter((object) => object.active !== false) : [])
      setRoles(Array.isArray(roleRes?.data) ? roleRes.data : [])
      setSaved((current) => ({
        ...current,
        workflow: responseRows(ruleRes).filter(isWorkflowRule),
        approval: responseRows(approvalRes),
        dashboard: responseRows(dashboardRes),
        report: responseRows(customReportRes),
      }))
    } catch (err) {
      setError(err?.message || 'Unable to load Builder metadata')
    } finally {
      setLoading(false)
    }
  }

  const loadSavedDefinitions = async (builderType = tab) => {
    setListLoading(true)
    setError('')
    try {
      if (builderType === 'workflow') {
        const response = await apiRequest('/api/platform/rules')
        setSaved((current) => ({ ...current, workflow: responseRows(response).filter(isWorkflowRule) }))
      } else if (builderType === 'approval') {
        const response = await apiRequest('/api/platform/approval-processes')
        setSaved((current) => ({ ...current, approval: responseRows(response) }))
      } else if (builderType === 'dashboard') {
        const response = await apiRequest('/api/dashboards')
        setSaved((current) => ({ ...current, dashboard: responseRows(response) }))
      } else if (builderType === 'report') {
        const response = await apiRequest('/api/reports/custom')
        setSaved((current) => ({ ...current, report: responseRows(response) }))
      }
    } catch (err) {
      setError(err?.message || `Unable to load existing ${builderType} definitions`)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => { void loadBase() }, [])
  useEffect(() => {
    const lock = tab === 'workflow' && mode === 'builder'
    if (!lock) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [tab, mode])
  useEffect(() => {
    if (!initialTab || initialTab === tab) return
    setTab(initialTab)
    setMode('list')
    setSelectedSavedId('')
    setSelectedNodeId('')
    setListQuery('')
    void loadSavedDefinitions(initialTab)
  }, [initialTab])

  const activeMeta = meta[tab]
  const selectedObject = objects.find((object) => String(object.id) === String(activeMeta?.objectId)) || null

  useEffect(() => {
    if (!selectedObject?.id) {
      setFields([])
      return
    }
    apiRequest(`/api/platform/objects/${encodeURIComponent(selectedObject.id)}/fields`)
      .then((response) => setFields(Array.isArray(response?.data) ? response.data.filter((field) => field.active !== false) : []))
      .catch(() => setFields([]))
  }, [selectedObject?.id, tab])

  const palette = useMemo(() => {
    let rows = []
    if (tab === 'workflow') {
      rows = []
    } else if (tab === 'approval') {
      rows = APPROVAL_STRUCTURAL_COMPONENTS.map((item) => ({ ...item, builderType: 'approval' }))
    } else if (tab === 'dashboard') {
      rows = componentRegistry.filter((component) => builderSupports(component, 'DASHBOARD')).map((component) => ({
        ...component, category: component.category || 'Dashboard', icon: component.key.includes('kpi') ? Gauge : component.key.includes('chart') || ['pie','donut','bar'].includes(component.key) ? BarChart3 : component.key === 'table' ? Table2 : LayoutDashboard, builderType: 'dashboard',
      }))
    } else {
      const iconFor = (key) => key === 'field' ? TextCursorInput : key === 'filter' ? Filter : key === 'group' ? Table2 : key === 'metric' ? BarChart3 : Table2
      rows = reportRegistry.map((component) => ({ ...component, icon: iconFor(component.key), builderType: 'report' }))
    }
    const q = paletteSearch.trim().toLowerCase()
    return q ? rows.filter((item) => `${item.label} ${item.category} ${item.key}`.toLowerCase().includes(q)) : rows
  }, [tab, actionRegistry, componentRegistry, reportRegistry, paletteSearch])

  const items = canvas[tab] || []
  const selectedNode = items.find((item) => item.id === selectedNodeId) || null

  const patchMeta = (patch) => setMeta((current) => ({ ...current, [tab]: { ...current[tab], ...patch } }))

  const addComponent = (component) => {
    const item = {
      id: `${tab}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      key: component.key,
      label: component.label,
      category: component.category,
      builderType: component.builderType || tab,
      config: {},
    }
    setCanvas((current) => ({ ...current, [tab]: [...(current[tab] || []), item] }))
    setSelectedNodeId(item.id)
  }

  const patchNode = (next) => setCanvas((current) => ({
    ...current,
    [tab]: (current[tab] || []).map((item) => item.id === selectedNodeId ? next : item),
  }))

  const removeNode = (id) => {
    setCanvas((current) => ({ ...current, [tab]: (current[tab] || []).filter((item) => item.id !== id) }))
    if (selectedNodeId === id) setSelectedNodeId('')
  }

  const dragStart = (event, component) => {
    event.dataTransfer.setData('application/x-onebuilder-component', JSON.stringify(component))
    event.dataTransfer.effectAllowed = 'copy'
  }

  const drop = (event) => {
    event.preventDefault()
    try {
      const raw = event.dataTransfer.getData('application/x-onebuilder-component')
      if (raw) addComponent(JSON.parse(raw))
    } catch {}
  }

  const newDefinition = () => {
    if (tab === 'workflow') {
      setWorkflowNewType('')
      setWorkflowNewObjectKey('')
      setWorkflowNewDialogOpen(true)
      return
    }
    setMode('builder')
    setSideTab('components')
    setSelectedSavedId('')
    setSelectedNodeId('')
    setCanvas((current) => ({ ...current, [tab]: [] }))
    setMeta((current) => ({
      ...current,
      [tab]: tab === 'approval' ? { name: '', objectId: '', active: false }
        : tab === 'dashboard' ? { name: '', description: '', apiKey: '' }
          : { label: '', description: '', objectId: '', reportKey: '' },
    }))
  }

  const createWorkflowDraft = () => {
    if (!workflowNewType) return
    const type = String(workflowNewType).toUpperCase()
    if (type === 'RECORD_TRIGGERED' && !workflowNewObjectKey) return
    const selectedObject = objects.find((object) => String(object?.object_key || object?.api_name || object?.key || object?.id || '') === String(workflowNewObjectKey)) || null
    const trigger = type === 'RECORD_TRIGGERED' ? 'after_save'
      : type === 'SCHEDULE_TRIGGERED' ? 'scheduled'
        : type === 'PLATFORM_EVENT_TRIGGERED' ? (triggers.find((option) => option.kind === 'event')?.key || 'manual')
          : 'manual'
    setWorkflowDraft({
      name: '',
      object: type === 'RECORD_TRIGGERED' ? workflowNewObjectKey : '',
      objectKey: type === 'RECORD_TRIGGERED' ? workflowNewObjectKey : '',
      objectId: type === 'RECORD_TRIGGERED' ? (selectedObject?.id || null) : null,
      trigger,
      version: 1,
      lifecycleStatus: 'DRAFT',
      active: false,
      runtimeActive: false,
      activeVersion: null,
      draftVersion: null,
      entryTransition: 'EVERY_TIME',
      inputContract: [],
      outputContract: [],
      actionMetadata: {
        apiName: '',
        description: '',
        flowType: type,
        optimizeFor: 'ACTIONS_AND_RELATED_RECORDS',
        includeAsyncPath: false,
        schedule: { scheduleType: 'DAILY', timezone: '', definition: { time: '' } },
        builderLayout: { mode: 'AUTO', positions: {} },
        builderGroups: [],
      },
      steps: [],
    })
    setSelectedSavedId('')
    setSelectedNodeId('')
    setSideTab('components')
    setWorkflowNewDialogOpen(false)
    setMode('builder')
  }

  const openSaved = async (id) => {
    if (!id) return newDefinition()
    setMode('builder')
    setSideTab('components')
    setError('')
    try {
      if (tab === 'workflow') {
        setWorkflowDraft(null)
        if (!saved.workflow.some((item) => String(item.id) === String(id))) {
          throw new Error('Workflow definition is no longer available. Refresh the list and try again.')
        }
      } else if (tab === 'approval') {
        const response = await apiRequest(`/api/platform/approval-processes/${encodeURIComponent(id)}`)
        const row = response?.data || {}
        const nodes = []
        for (const rule of row.conditions?.rules || []) nodes.push({ id: `criteria_${nodes.length}_${Date.now()}`, key: 'criteria', label: 'Entry criteria', builderType: 'approval', config: { ...rule } })
        for (const step of row.steps || []) nodes.push({ id: `approver_${nodes.length}_${Date.now()}`, key: 'approver', label: step.label || 'Approver', builderType: 'approval', config: { roleId: step.role_id || step.roleId || '', ...(step.config || {}) } })
        for (const [configKey, nodeKey, label] of [['submissionActions','submission_action','Submission action'],['finalApprovalActions','approval_action','Approval action'],['finalRejectionActions','rejection_action','Rejection action']]) {
          for (const action of row.config?.[configKey] || []) nodes.push({ id: `${nodeKey}_${nodes.length}_${Date.now()}`, key: nodeKey, label, builderType: 'approval', config: { actionType: action.type || action.key, actionConfig: Object.fromEntries(Object.entries(action).filter(([key]) => !['type','key'].includes(key))) } })
        }
        setMeta((current) => ({ ...current, approval: { name: row.name || '', objectId: row.object_id || '', active: row.active !== false, config: row.config || {} } }))
        setCanvas((current) => ({ ...current, approval: nodes }))
      } else if (tab === 'dashboard') {
        const row = saved.dashboard.find((item) => String(item.id) === String(id))
        if (!row) return
        setMeta((current) => ({ ...current, dashboard: { name: row.name || '', description: row.description || '', apiKey: row.api_key || row.apiKey || '' } }))
        setCanvas((current) => ({ ...current, dashboard: (row.components || []).map((component) => ({ id: component.id || `dashboard_${Date.now()}`, key: component.type, label: component.title || component.type, builderType: 'dashboard', config: component.config || {}, layout: component.layout || {} })) }))
      } else {
        const row = saved.report.find((item) => String(item.id) === String(id))
        if (!row) return
      }
      setSelectedSavedId(id)
      setSelectedNodeId('')
      if (tab === 'workflow') onWorkflowOpen?.(id)
    } catch (err) {
      setError(err?.message || 'Unable to open definition')
    }
  }

  useEffect(() => {
    if (tab !== 'workflow' || !initialWorkflowId || loading || listLoading) return
    if (openedRouteWorkflowRef.current === String(initialWorkflowId)) return
    const exists = saved.workflow.some((item) => String(item.id) === String(initialWorkflowId))
    if (!exists) return
    openedRouteWorkflowRef.current = String(initialWorkflowId)
    void openSaved(initialWorkflowId)
  }, [tab, initialWorkflowId, loading, listLoading, saved.workflow])

  const saveDefinition = async () => {
    setError('')
    setMessage('')
    try {
      if (tab === 'workflow') {
        throw new Error('Workflow definitions are saved only through WorkflowAdmin.')
      } else if (tab === 'approval') {
        if (!activeMeta.name || !activeMeta.objectId) throw new Error('Approval name and object are required.')
        const conditions = items.filter((item) => item.key === 'criteria' && item.config?.field).map((item) => ({ id: item.id, field: item.config.field, operator: item.config.operator || 'equals', value: item.config.value }))
        const steps = items.filter((item) => item.key === 'approver').map((item) => ({ label: item.label || 'Approval', roleId: item.config?.roleId || '', config: Object.fromEntries(Object.entries(item.config || {}).filter(([key]) => key !== 'roleId')) }))
        const actionsFor = (key) => items.filter((item) => item.key === key && item.config?.actionType).map((item) => ({ type: item.config.actionType, ...(item.config.actionConfig || {}) }))
        const config = { ...(activeMeta.config || {}), submissionActions: actionsFor('submission_action'), finalApprovalActions: actionsFor('approval_action'), finalRejectionActions: actionsFor('rejection_action') }
        const payload = { objectId: activeMeta.objectId, name: activeMeta.name, active: activeMeta.active === true, conditions: { type: 'all', rules: conditions }, config, steps }
        const response = await apiRequest(selectedSavedId ? `/api/platform/approval-processes/${encodeURIComponent(selectedSavedId)}` : '/api/platform/approval-processes', { method: selectedSavedId ? 'PUT' : 'POST', body: JSON.stringify(payload) })
        if (response?.data?.id) setSelectedSavedId(response.data.id)
      } else if (tab === 'dashboard') {
        if (!activeMeta.name) throw new Error('Dashboard name is required.')
        const payload = {
          name: activeMeta.name, description: activeMeta.description || '', apiKey: activeMeta.apiKey || safeKey(activeMeta.name, 'dashboard'),
          components: items.map((item, index) => ({ id: item.id, type: item.key, title: item.label || item.key, config: item.config || {}, layout: item.layout || { x: (index * 4) % 12, y: Math.floor(index / 3) * 2, w: 4, h: 2 } })),
          filters: [],
        }
        const response = await apiRequest(selectedSavedId ? `/api/dashboards/${encodeURIComponent(selectedSavedId)}` : '/api/dashboards', { method: selectedSavedId ? 'PUT' : 'POST', body: JSON.stringify(payload) })
        if (response?.data?.id) setSelectedSavedId(response.data.id)
      } else if (tab === 'report') {
        throw new Error('Reports are saved only through the Custom Report Builder.')
      }
      await loadBase()
      await loadSavedDefinitions(tab)
      setMessage('Saved.')
      setMode('list')
      setSelectedNodeId('')
      setSideTab('components')
    } catch (err) {
      setError(err?.message || 'Unable to save')
    }
  }

  const activeTab = TABS.find((item) => item.key === tab)
  const ActiveTabIcon = activeTab?.icon || LayoutDashboard
  const listRows = saved[tab] || []

  const rowTitle = (item) => item?.name || item?.label || item?.report_key || item?.api_key || 'Untitled'
  const rowSubtitle = (item) => {
    if (tab === 'workflow') return item?.trigger_key || 'Workflow'
    if (tab === 'approval') return item?.active === false ? 'Inactive' : 'Active'
    if (tab === 'dashboard') return item?.description || item?.api_key || 'Dashboard'
    return item?.description || item?.report_key || 'Report'
  }

  const visibleListRows = useMemo(() => {
    const query = listQuery.trim().toLowerCase()
    if (!query) return listRows
    return listRows.filter((item) => `${rowTitle(item)} ${rowSubtitle(item)} ${item?.id || ''}`.toLowerCase().includes(query))
  }, [listRows, listQuery, tab])

  const workflowObjectKey = (item) => String(
    item?.object || item?.object_key || item?.objectKey || item?.trigger_object ||
    item?.action?.object || item?.action?.objectKey || item?.definition?.object || ''
  ).trim()

  const workflowGroups = useMemo(() => {
    if (tab !== 'workflow') return []
    const objectLabelByKey = new Map()
    objects.forEach((object) => {
      const key = String(object?.object_key || object?.api_name || object?.key || object?.id || '').trim()
      if (key) objectLabelByKey.set(key, object?.label || object?.name || key)
      if (object?.id) objectLabelByKey.set(String(object.id), object?.label || object?.name || key || String(object.id))
    })
    const groups = new Map()
    visibleListRows.forEach((item) => {
      const key = workflowObjectKey(item)
      const label = key ? (objectLabelByKey.get(key) || key) : 'System / No Object'
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(item)
    })
    return [...groups.entries()]
      .map(([label, rows]) => ({ label, rows: [...rows].sort((a, b) => rowTitle(a).localeCompare(rowTitle(b))) }))
      .sort((a, b) => {
        if (a.label === 'System / No Object') return 1
        if (b.label === 'System / No Object') return -1
        return a.label.localeCompare(b.label)
      })
  }, [tab, visibleListRows, objects])

  if (tab === 'workflow' && mode === 'builder') {
    return (
      <div className="onebuilder-workflow-workspace" role="dialog" aria-modal="true" aria-label="Workflow Builder workspace">
        <div className="onebuilder-workflow-window">
          <Builder2Page
            initialWorkflowId={selectedSavedId}
            initialFlowType={workflowDraft?.actionMetadata?.flowType || ''}
            initialObjectKey={workflowDraft?.objectKey || workflowDraft?.object || ''}
            onClose={() => {
              setMode('list')
              setWorkflowDraft(null)
              setSelectedSavedId('')
              setSelectedNodeId('')
              setSideTab('components')
              setError('')
              onWorkflowClose?.()
              void loadSavedDefinitions('workflow')
            }}
            onSaved={(savedWorkflow) => {
              setMessage('Saved.')
              if (savedWorkflow?.id) {
                const id = String(savedWorkflow.id)
                setSelectedSavedId(id)
                onWorkflowOpen?.(id)
              }
              void loadSavedDefinitions('workflow')
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="onebuilder">
      {!singleBuilder ? (
      <div className="onebuilder-tabs onebuilder-tabs--compact" role="tablist" aria-label="OneBuilder tools">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`onebuilder-tab ${tab === key ? 'is-active' : ''}`}
            onClick={() => {
              setTab(key)
              void loadSavedDefinitions(key)
              setMode('list')
              setSideTab('components')
              setPaletteSearch('')
              setSelectedNodeId('')
              setSelectedSavedId('')
              setMessage('')
              setError('')
            }}
          >
            <Icon size={14}/>
            <span>{label}</span>
          </button>
        ))}
      </div>
      ) : null}

      {workflowNewDialogOpen ? (
        <div className="onebuilder-new-flow-backdrop" role="dialog" aria-modal="true" aria-label="New Flow">
          <div className="onebuilder-new-flow-dialog">
            <header>
              <div>
                <strong>New Flow</strong>
                <span>Choose the type of flow you want to build.</span>
              </div>
              <button type="button" aria-label="Close New Flow" onClick={() => setWorkflowNewDialogOpen(false)}>×</button>
            </header>
            <div className="onebuilder-new-flow-body">
              <div className="onebuilder-new-flow-heading">Select a Flow Type</div>
              <div className="onebuilder-new-flow-grid">
                {FLOW_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`onebuilder-new-flow-type ${workflowNewType === option.key ? 'is-selected' : ''}`}
                    aria-pressed={workflowNewType === option.key}
                    onClick={() => setWorkflowNewType(option.key)}
                  >
                    <span className="onebuilder-new-flow-icon">{option.icon}</span>
                    <span><strong>{option.label}</strong><small>{option.description}</small></span>
                  </button>
                ))}
              </div>
              {workflowNewType === 'RECORD_TRIGGERED' ? (
                <label className="onebuilder-new-flow-object">
                  <span>Object</span>
                  <select value={workflowNewObjectKey} onChange={(event) => setWorkflowNewObjectKey(event.target.value)}>
                    <option value="">Select an object…</option>
                    {objects.map((object) => {
                      const key = String(object?.object_key || object?.api_name || object?.key || object?.id || '')
                      return key ? <option key={key} value={key}>{object?.label || object?.name || key}</option> : null
                    })}
                  </select>
                  <small>Choose the record object before opening the builder.</small>
                </label>
              ) : null}
            </div>
            <footer>
              <span />
              <span className="onebuilder-new-flow-actions">
                <button type="button" className="onebuilder-new-flow-secondary" onClick={() => setWorkflowNewDialogOpen(false)}>Cancel</button>
                <button type="button" className="onebuilder-new-flow-primary" disabled={!workflowNewType || (workflowNewType === 'RECORD_TRIGGERED' && !workflowNewObjectKey)} onClick={createWorkflowDraft}>Create</button>
              </span>
            </footer>
          </div>
        </div>
      ) : null}

      {error ? <div className="onebuilder-error">{error}</div> : null}

      {tab === 'page' ? (
        <CustomPageBuilder onMessage={(value) => setMessage(value || '')} onError={(value) => setError(value || '')} />
      ) : mode === 'list' ? (
        <section className="onebuilder-list-view">
          <header className="onebuilder-list-header">
            <div>
              <strong>{activeTab?.label}</strong>
              <span>{listRows.length} existing</span>
            </div>
            <div className="onebuilder-list-actions">
              <button type="button" className="onebuilder-list-add" onClick={() => void loadSavedDefinitions(tab)} title={`Refresh ${activeTab?.label}`} aria-label={`Refresh ${activeTab?.label}`} disabled={listLoading}>
                <RefreshCw size={14} className={listLoading ? 'is-spinning' : ''}/>
              </button>
              <button type="button" className="onebuilder-list-add" onClick={newDefinition} title={tab === 'workflow' ? 'New Flow' : `New ${activeTab?.label}`} aria-label={tab === 'workflow' ? 'New Flow' : `New ${activeTab?.label}`}>
                <Plus size={15}/>
              </button>
            </div>
          </header>

          <label className="onebuilder-list-search">
            <Search size={14}/>
            <input value={listQuery} onChange={(event) => setListQuery(event.target.value)} placeholder={`Search ${activeTab?.label || 'definitions'}`} />
          </label>
          <div className="onebuilder-list-body">
            {(loading || listLoading) ? <div className="onebuilder-list-empty">Loading existing definitions…</div> : null}
            {!loading && !listLoading && visibleListRows.length ? (
              tab === 'workflow' ? workflowGroups.map((group) => {
                const expanded = expandedWorkflowGroups[group.label] === true
                return (
                <section key={group.label} className={`onebuilder-workflow-group ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
                  <button
                    type="button"
                    className="onebuilder-workflow-group-head"
                    onClick={() => setExpandedWorkflowGroups((current) => ({ ...current, [group.label]: !expanded }))}
                    aria-expanded={expanded}
                  >
                    <span className="onebuilder-workflow-group-toggle">{expanded ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}</span>
                    <span>{group.label}</span>
                    <small>{group.rows.length}</small>
                  </button>
                  {expanded ? group.rows.map((item) => (
                    <button key={item.id} type="button" className="onebuilder-list-row" onClick={() => openSaved(item.id)}>
                      <span className="onebuilder-list-row-icon"><ActiveTabIcon size={15}/></span>
                      <span className="onebuilder-list-row-copy">
                        <strong>{rowTitle(item)}</strong>
                        <small>{rowSubtitle(item)}</small>
                      </span>
                      <span className="onebuilder-list-row-state">{item.active === false ? 'Inactive' : ''}</span>
                      <span className="onebuilder-list-row-edit" title="Open editor" aria-label="Open editor"><Pencil size={13}/></span>
                    </button>
                  )) : null}
                </section>
                )
              }) : visibleListRows.map((item) => (
                <button key={item.id} type="button" className="onebuilder-list-row" onClick={() => openSaved(item.id)}>
                  <span className="onebuilder-list-row-icon"><ActiveTabIcon size={15}/></span>
                  <span className="onebuilder-list-row-copy">
                    <strong>{rowTitle(item)}</strong>
                    <small>{rowSubtitle(item)}</small>
                  </span>
                  <span className="onebuilder-list-row-state">{item.active === false ? 'Inactive' : ''}</span>
                  <span className="onebuilder-list-row-edit" title="Open editor" aria-label="Open editor"><Pencil size={13}/></span>
                </button>
              ))
            ) : null}
            {!loading && !listLoading && !visibleListRows.length ? (
              <div className="onebuilder-list-empty">
                <ActiveTabIcon size={28}/>
                <strong>No {activeTab?.label?.toLowerCase()} configured</strong>
                <span>Use + to create the first one.</span>
              </div>
            ) : null}
          </div>
        </section>
      ) : tab === 'report' ? (
        <CustomReportsAdmin
          embedded
          initialReport={selectedSavedId ? saved.report.find((item) => String(item.id) === String(selectedSavedId)) || null : null}
          onClose={() => {
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
            setError('')
            void loadSavedDefinitions('report')
          }}
          onSaved={() => {
            setMessage('Saved.')
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
            void loadSavedDefinitions('report')
          }}
        />
      ) : tab === 'approval' ? (
        <ApprovalProcessBuilder
          embedded
          initialProcess={selectedSavedId ? saved.approval.find((item) => String(item.id) === String(selectedSavedId)) || null : null}
          onMessage={(value) => setMessage(value || '')}
          onError={(value) => setError(value || '')}
          onClose={() => {
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
            setError('')
            void loadSavedDefinitions('approval')
          }}
          onSaved={() => {
            setMessage('Saved.')
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
            void loadSavedDefinitions('approval')
          }}
        />
      ) : tab === 'workflow' ? (
        <WorkflowAdmin
          embedded
          initialWorkflow={selectedSavedId ? saved.workflow.find((item) => String(item.id) === String(selectedSavedId)) || null : null}
          onMessage={(value) => setMessage(value || '')}
          onError={(value) => setError(value || '')}
          onClose={() => {
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
            setError('')
            void loadSavedDefinitions('workflow')
          }}
          onSaved={(savedWorkflow, options = {}) => {
            setMessage('Saved.')
            void loadSavedDefinitions('workflow')
            if (options.keepOpen) {
              if (savedWorkflow?.id) setSelectedSavedId(String(savedWorkflow.id))
              return
            }
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
          }}
        />
      ) : tab === 'dashboard' ? (
        <DashboardBuilder
          embedded
          initialDashboard={selectedSavedId ? saved.dashboard.find((item) => String(item.id) === String(selectedSavedId)) || null : null}
          onClose={() => {
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
            setError('')
            void loadSavedDefinitions('dashboard')
          }}
          onSaved={() => {
            setMessage('Saved.')
            setMode('list')
            setSelectedSavedId('')
            setSelectedNodeId('')
            setSideTab('components')
            void loadSavedDefinitions('dashboard')
          }}
        />
      ) : (
        <>
          <div className="onebuilder-definition-bar onebuilder-definition-bar--builder">
            <button type="button" className="onebuilder-cancel" onClick={() => { setMode('list'); setSelectedNodeId(''); setSideTab('components'); setError('') }}>Cancel</button>
            {tab === 'report'
              ? <input placeholder="Report name" value={activeMeta.label || ''} onChange={(e) => patchMeta({ label: e.target.value })}/>
              : <input placeholder={`${activeTab?.label} name`} value={activeMeta.name || ''} onChange={(e) => patchMeta({ name: e.target.value })}/>}
            {['workflow','approval','report'].includes(tab) ? (
              <select value={activeMeta.objectId || ''} onChange={(e) => { patchMeta({ objectId: e.target.value }); if (tab === 'report') setSelectedSavedId('') }}>
                <option value="">Select object</option>
                {objects.map((object) => <option key={object.id} value={object.id}>{object.label}</option>)}
              </select>
            ) : null}
            {tab === 'workflow' ? (
              <select value={activeMeta.triggerKey || ''} onChange={(e) => patchMeta({ triggerKey: e.target.value })}>
                <option value="">Select trigger/event</option>
                {triggers.map((trigger) => <option key={trigger.key} value={trigger.key}>{trigger.kind === 'event' ? 'Event · ' : ''}{trigger.label}</option>)}
              </select>
            ) : null}
            {['workflow','approval'].includes(tab) ? (
              <label className="onebuilder-active-toggle"><input type="checkbox" checked={activeMeta.active === true} onChange={(e) => patchMeta({ active: e.target.checked })}/> Active</label>
            ) : null}
            <span className="onebuilder-definition-spacer"/>
            <button type="button" className="onebuilder-save" onClick={saveDefinition}>Save</button>
          </div>

          {tab === 'approval' ? (
            <div className="onebuilder-approval-options">
              {[
                ['lockRecord','Lock record while pending'],
                ['allowReassign','Allow reassignment'],
                ['requireCommentOnReject','Require rejection comment'],
              ].map(([key, label]) => <label key={key}><input type="checkbox" checked={activeMeta.config?.[key] !== false} onChange={(e) => patchMeta({ config: { ...(activeMeta.config || {}), [key]: e.target.checked } })}/> {label}</label>)}
            </div>
          ) : null}

          <div className="onebuilder-workspace onebuilder-workspace--compact-inspector">
            <main className="onebuilder-canvas-card" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
              <div className="onebuilder-canvas-header">
                <div><strong>{activeTab?.label}</strong><span>{tab === 'workflow' ? 'Registered actions + events' : tab === 'report' ? 'Platform report metadata' : 'Canvas'}</span></div>
                <button type="button" className="onebuilder-clear" disabled={!items.length} onClick={() => setCanvas((current) => ({ ...current, [tab]: [] }))}>Clear</button>
              </div>
              <div className="onebuilder-canvas">
                {!items.length ? (
                  <div className="onebuilder-empty">
                    <ActiveTabIcon size={30}/>
                    <strong>Start building</strong>
                    <span>Add a component from the inspector.</span>
                  </div>
                ) : (
                  <div className="onebuilder-canvas-stack">
                    {items.map((item, index) => (
                      <BuilderNode
                        key={item.id}
                        item={item}
                        index={index}
                        selected={item.id === selectedNodeId}
                        onSelect={() => { setSelectedNodeId(item.id); setSideTab('properties') }}
                        onRemove={() => removeNode(item.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </main>

            <aside className="onebuilder-inspector">
              <div className="onebuilder-inspector-tabs">
                <button type="button" className={sideTab === 'components' ? 'is-active' : ''} onClick={() => setSideTab('components')}>Components</button>
                <button type="button" className={sideTab === 'properties' ? 'is-active' : ''} onClick={() => setSideTab('properties')}>Properties</button>
              </div>

              {sideTab === 'components' ? (
                <div className="onebuilder-inspector-panel">
                  <label className="onebuilder-component-search onebuilder-component-search--compact">
                    <Search size={13}/>
                    <input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder="Search"/>
                  </label>
                  <div className="onebuilder-component-list onebuilder-component-list--compact">
                    {palette.map((component) => {
                      const Icon = component.icon || LayoutDashboard
                      return (
                        <button
                          type="button"
                          draggable
                          className="onebuilder-component onebuilder-component--compact"
                          key={component.key}
                          onDragStart={(event) => dragStart(event, component)}
                          onClick={() => addComponent(component)}
                        >
                          <span className="onebuilder-component-icon onebuilder-component-icon--compact"><Icon size={14}/></span>
                          <span><b>{component.label}</b><small>{component.category}</small></span>
                          <Plus size={12}/>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="onebuilder-inspector-panel onebuilder-inspector-properties">
                  <div className="onebuilder-inspector-title">
                    <strong>Properties</strong>
                    <span>{selectedNode ? selectedNode.label : 'No selection'}</span>
                  </div>
                  <GenericProperties item={selectedNode} fields={fields} actionRegistry={actionRegistry} roles={roles} onChange={patchNode}/>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {message ? <div className="onebuilder-message">{message}</div> : null}
    </div>
  )
}
