import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  ChevronRight,
  AppWindow,
  BarChart3,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  UserCheck,
  Rocket,
  ShieldCheck,
  Search,
  Workflow,
} from 'lucide-react'
import { getStoredUser } from '../../services/api'
import OneBuilder from '../settings/OneBuilder'
import ObjectsSettingsPane from '../settings/ObjectsSettingsPane'
import WorkflowRunsAdmin from '../settings/Platform/WorkflowRunsAdmin'
import WorkItemsAdmin from '../settings/Platform/WorkItemsAdmin'
import PlatformAppsAdmin from '../settings/Platform/PlatformAppsAdmin'
import DeploymentAdmin from '../settings/Platform/DeploymentAdmin'
import NotificationSubscriptionsAdmin from '../settings/Platform/NotificationSubscriptionsAdmin'
import ValueSetList from '../settings/Platform/ValueSetList'
import OneEngineManager from './OneEngineManager'

const DEVELOPER_ITEMS = [
  { key: 'objects', label: 'Objects', icon: LayoutGrid },
  { key: 'workflow-builder', label: 'Workflow Builder', icon: Workflow },
  { key: 'approval-builder', label: 'Approval Flow Builder', icon: UserCheck },
  { key: 'page-builder', label: 'Page Builder', icon: AppWindow },
  { key: 'dashboard-builder', label: 'Dashboard Builder', icon: LayoutDashboard },
  { key: 'report-builder', label: 'Report Builder', icon: BarChart3 },
  { key: 'workflow-runs', label: 'Workflow Runs', icon: Workflow },
  { key: 'work-items', label: 'Work Items', icon: ListChecks },
  { key: 'oneengine-manager', label: 'OneEngine Manager', icon: ShieldCheck },
  { key: 'platform-apps', label: 'OneEngine Apps', icon: LayoutGrid },
  { key: 'deployments', label: 'Deployments', icon: Rocket },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'value-sets', label: 'Value Sets', icon: ListChecks },
]

function normalizeSection(value) {
  const raw = String(value || '').trim().toLowerCase()
  const key = raw === 'platform' ? 'oneengine-manager' : raw
  return DEVELOPER_ITEMS.some((item) => item.key === key) ? key : 'objects'
}

export default function OneDeveloperPage({ initialSection = 'objects', onSectionChange }) {
  const [active, setActive] = useState(() => normalizeSection(initialSection))
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setActive(normalizeSection(initialSection))
  }, [initialSection])
  const user = getStoredUser() || {}
  const profileName = user?.name || user?.full_name || user?.username || 'User'
  const profileRole = user?.isSuperadmin || user?.is_superadmin ? 'Superadmin' : (user?.role || 'Developer')
  const initial = profileName.trim().charAt(0).toUpperCase() || 'U'

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? DEVELOPER_ITEMS.filter((item) => item.label.toLowerCase().includes(q)) : DEVELOPER_ITEMS
  }, [query])

  const current = DEVELOPER_ITEMS.find((item) => item.key === active) || DEVELOPER_ITEMS[0]

  const select = (key) => {
    setActive(key)
    setError('')
    onSectionChange?.(key)
  }

  return (
    <section className="settings-page onedeveloper-page">
      <aside className="settings-sidebar">
        <div className="settings-window-title">OneDeveloper</div>
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
                <button
                  key={item.key}
                  type="button"
                  className={`settings-nav-item ${current.key === item.key ? 'is-active' : ''}`}
                  onClick={() => select(item.key)}
                >
                  <span className="settings-nav-icon settings-nav-icon--cyan"><Icon size={16}/></span>
                  <span>{item.label}</span>
                  <ChevronRight size={14} className="settings-chevron"/>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <div className="settings-content">
        <div className="settings-content-header"><h2>{current.label}</h2></div>
        <div className="settings-content-body">
          {error ? <div className="settings-error">{error}</div> : null}
          {current.key === 'objects' ? (
            <ObjectsSettingsPane />
          ) : current.key === 'workflow-builder' ? (
            <OneBuilder initialTab="workflow" singleBuilder />
          ) : current.key === 'approval-builder' ? (
            <OneBuilder initialTab="approval" singleBuilder />
          ) : current.key === 'page-builder' ? (
            <OneBuilder initialTab="page" singleBuilder />
          ) : current.key === 'dashboard-builder' ? (
            <OneBuilder initialTab="dashboard" singleBuilder />
          ) : current.key === 'report-builder' ? (
            <OneBuilder initialTab="report" singleBuilder />
          ) : current.key === 'workflow-runs' ? (
            <WorkflowRunsAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
          ) : current.key === 'work-items' ? (
            <WorkItemsAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
          ) : current.key === 'oneengine-manager' ? (
            <OneEngineManager />
          ) : current.key === 'platform-apps' ? (
            <PlatformAppsAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
          ) : current.key === 'deployments' ? (
            <DeploymentAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
          ) : current.key === 'notifications' ? (
            <NotificationSubscriptionsAdmin onMessage={() => {}} onError={(value) => setError(value || '')} />
          ) : current.key === 'value-sets' ? (
            <ValueSetList onMessage={() => {}} onError={(value) => setError(value || '')} />
          ) : null}
        </div>
      </div>
    </section>
  )
}
