import { useEffect, useMemo, useState } from 'react'
import {
  Bell, Bug, Building2, ChevronRight, AppWindow, BarChart3, LayoutDashboard,
  LayoutGrid, ListChecks, UserCheck, Rocket, Search, Workflow,
} from 'lucide-react'
import { apiRequest, loadSessionPermissions, getActingCompanyId, getStoredUser, setActingCompanyId } from '../../services/api'
import { clearSettingsContextCache } from '../../services/settings'
import OneBuilder from '../settings/OneBuilder'
import { ReportTypeManager } from '../reports/ReportTypeDesigner.jsx'
import ObjectsSettingsPane from '../settings/ObjectsSettingsPane'
import WorkflowRunsAdmin from '../settings/Platform/WorkflowRunsAdmin'
import WorkItemsAdmin from '../settings/Platform/WorkItemsAdmin'
import PackageBuilderAdmin from '../settings/Platform/PackageBuilderAdmin'
import DeploymentAdmin from '../settings/Platform/DeploymentAdmin'
import NotificationSubscriptionsAdmin from '../settings/Platform/NotificationSubscriptionsAdmin'
import ValueSetList from '../settings/Platform/ValueSetList'
import DebugCodesAdmin from './DebugCodesAdmin'
import GPTBuilderPage from './gptbuilder/GPTBuilderPage'
import './OneDeveloperPage.css'

const DEVELOPER_ITEMS = [
  { key: 'objects', label: 'Objects', icon: LayoutGrid },
  { key: 'workflow-builder', label: 'Workflow Builder', icon: Workflow },
  { key: 'gptbuilder', label: 'GPT Builder', icon: Workflow },
  { key: 'approval-builder', label: 'Approval Flow Builder', icon: UserCheck },
  { key: 'page-builder', label: 'Page Builder', icon: AppWindow },
  { key: 'dashboard-builder', label: 'Dashboard Builder', icon: LayoutDashboard },
  { key: 'report-types', label: 'Report Types', icon: ListChecks },
  { key: 'report-builder', label: 'Report Builder', icon: BarChart3 },
  { key: 'workflow-runs', label: 'Workflow Runs', icon: Workflow },
  { key: 'work-items', label: 'Work Items', icon: ListChecks },
  { key: 'platform-apps', label: 'Package Builder', icon: LayoutGrid },
  { key: 'deployments', label: 'Deployments', icon: Rocket },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'value-sets', label: 'Value Sets', icon: ListChecks },
  { key: 'debug', label: 'Debug', icon: Bug },
]

function normalizeSection(value) {
  const raw = String(value || '').trim().toLowerCase()
  const migrated = raw === 'builder2' ? 'workflow-builder' : raw
  return DEVELOPER_ITEMS.some((item) => item.key === migrated) ? migrated : 'objects'
}

export default function OneDeveloperPage({ initialSection = 'objects', initialWorkflowId = '', onSectionChange }) {
  const loggedInCompanyId = String(getStoredUser()?.companyId || getStoredUser()?.company_id || getStoredUser()?.company?.id || '')
  const [active, setActive] = useState(() => normalizeSection(initialSection))
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [clients, setClients] = useState([])
  const [clientQuery, setClientQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState(() => loggedInCompanyId || getActingCompanyId() || '')
  const [canManageEngine, setCanManageEngine] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(true)

  useEffect(() => { setActive(normalizeSection(initialSection)) }, [initialSection])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setClientsLoading(true)
        const permissions = await loadSessionPermissions()
        if (!permissions?.permissions?.includes('oneengine.manage')) {
          setCanManageEngine(false)
          return
        }
        const response = await apiRequest('/api/platform/developer/companies')
        if (!alive) return
        const rows = Array.isArray(response?.data) ? response.data : []
        setCanManageEngine(true)
        setClients(rows)
        const current = getActingCompanyId()
        const ownCompany = rows.find((row) => loggedInCompanyId && String(row.id) === String(loggedInCompanyId))
        const storedCompany = rows.find((row) => current && String(row.id) === String(current))
        const preferred = ownCompany || storedCompany || rows[0] || null
        if (preferred) {
          const preferredId = String(preferred.id)
          if (preferredId !== String(current || '')) {
            await apiRequest('/api/platform/developer/acting-company', {
              method: 'PUT',
              body: JSON.stringify({ actingCompanyId: preferred.id }),
            })
            setActingCompanyId(preferred.id)
            clearSettingsContextCache()
          }
          setSelectedClient(preferredId)
        }
      } catch (e) {
        if (!alive) return
        if (e?.status === 403) {
          setCanManageEngine(false)
          setClients([])
        } else {
          setError(e?.message || 'Unable to load client context')
        }
      } finally {
        if (alive) setClientsLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const user = getStoredUser() || {}
  const profileName = user?.name || user?.full_name || user?.username || 'User'
  const profileRole = user?.role || 'Developer'
  const initial = profileName.trim().charAt(0).toUpperCase() || 'U'

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? DEVELOPER_ITEMS.filter((item) => item.label.toLowerCase().includes(q)) : DEVELOPER_ITEMS
  }, [query])

  const visibleClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    return clients.filter((client) => !q || String(client.name || '').toLowerCase().includes(q))
  }, [clients, clientQuery])

  const current = DEVELOPER_ITEMS.find((item) => item.key === active) || DEVELOPER_ITEMS[0]

  const select = (key) => {
    setActive(key)
    setError('')
    onSectionChange?.(key)
  }

  const chooseClient = async (id) => {
    if (!id || String(id) === String(selectedClient)) return
    try {
      setError('')
      await apiRequest('/api/platform/developer/acting-company', {
        method: 'PUT',
        body: JSON.stringify({ actingCompanyId: id }),
      })
      setActingCompanyId(id)
      clearSettingsContextCache()
      setSelectedClient(String(id))
    } catch (e) {
      setError(e?.message || 'Unable to select client')
    }
  }

  // Keep the builder mounted while Engine authority/clients load.
  // selectedClient is initialised from the stored acting company, so changing
  // canManageEngine alone must not destroy in-progress editor state.
  const contentKey = `${current.key}:${selectedClient || "self"}`

  return (
    <section className="settings-page onedeveloper-page">
      <aside className="settings-sidebar">
        {canManageEngine ? (
          <div className="oneengine-client-selector">
            <span>Client</span>
            <label className="oneengine-client-selector-control">
              <Building2 size={14}/>
              <select
                value={selectedClient}
                onChange={(event) => void chooseClient(event.target.value)}
                aria-label="Choose client"
              >
                <option value="" disabled>Choose client…</option>
                {visibleClients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
          </div>
        ) : null}
        <label className="settings-search">
          <Search size={17}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
        </label>
        <div className="settings-profile">
          <div className="settings-avatar">{initial}</div>
          <div><strong>{profileName}</strong><span>{profileRole}</span></div>
        </div>
        <div className="settings-nav">
          <div className="settings-group">
            <div className="metadata-settings-group-label">Developer</div>
            {visibleItems.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.key} type="button" className={`settings-nav-item ${current.key === item.key ? 'is-active' : ''}`} onClick={() => select(item.key)}>
                  <span className="settings-nav-icon settings-nav-icon--cyan"><Icon size={16}/></span>
                  <span>{item.label}</span>
                  <ChevronRight size={14} className="settings-chevron"/>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <div className="settings-content" key={contentKey}>
        <div className="settings-content-body">
          {error ? <div className="settings-error">{error}</div> : null}
          {clientsLoading ? <div className="settings-state-card">Resolving client context…</div>
            : current.key === 'objects' ? <ObjectsSettingsPane />
            : current.key === 'workflow-builder' ? <OneBuilder initialTab="workflow" singleBuilder initialWorkflowId={initialWorkflowId} onWorkflowOpen={(workflowId) => onSectionChange?.('workflow-builder', { workflowId })} onWorkflowClose={() => onSectionChange?.('workflow-builder', { workflowId: '' })} />
            : current.key === 'gptbuilder' ? <GPTBuilderPage initialWorkflowId={initialWorkflowId} onWorkflowOpen={(workflowId) => onSectionChange?.('gptbuilder', { workflowId })} />
            : current.key === 'approval-builder' ? <OneBuilder initialTab="approval" singleBuilder />
            : current.key === 'page-builder' ? <OneBuilder initialTab="page" singleBuilder />
            : current.key === 'dashboard-builder' ? <OneBuilder initialTab="dashboard" singleBuilder />
            : current.key === 'report-types' ? <ReportTypeManager />
            : current.key === 'report-builder' ? <OneBuilder initialTab="report" singleBuilder />
            : current.key === 'workflow-runs' ? <WorkflowRunsAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
            : current.key === 'work-items' ? <WorkItemsAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
            : current.key === 'platform-apps' ? <PackageBuilderAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
            : current.key === 'deployments' ? <DeploymentAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
            : current.key === 'notifications' ? <NotificationSubscriptionsAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
            : current.key === 'value-sets' ? <ValueSetList onMessage={() => {}} onError={(value) => setError(value || '')} />
            : current.key === 'debug' ? <DebugCodesAdmin onError={(value) => setError(value || '')} />
            : null}
        </div>
      </div>
    </section>
  )
}
