import { LazyLoadBoundary, lazyWithRecovery } from './app/bootstrap/lazyWithRecovery.jsx'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { apiRequest, checkBackend, consumeGoogleOAuthCallback, ensureActingCompanyContext, ensureActiveStoreContext, getActiveStoreId, getAvailableStores, getStoredSessionPermissions, getStoredUser, hasSession, hasSessionContext, loadSessionPermissions, login, logout, setActiveStoreId, startGoogleLogin, verifyPin } from './services/api'
import { DEVELOPER_SETTINGS_KEYS, readRoute, setRoute } from './navigation/routes'
import { MenuBarClock, useClock } from './shell/clock/ShellClock'
import RdvnReferenceDock, { dockItems } from './shell/dock/RdvnReferenceDock'
import { CompanyContextLoading, LockScreen } from './shell/auth/LoginShell'
import { createRole, loadPermissions, loadRolePermissions, loadRoles, loadSettingsCatalog, loadSettingsContext, loadUsers, patchCompanySettings, patchSettings, readSettingsContextCache, saveRolePermissions, updateRole } from './services/settings'
import { settingSectionAccess, sectionIsVisible } from './utils/settingsAccess'
import { appIconUrl, applyDefaultAppIcon, localAppIcon, marketplaceSearchText, readMarketplaceCache, resolveAppOpenRoute, writeMarketplaceCache } from './utils/appMarketplace'
import JarvisOrb, { ORB_STATES } from './shell/jarvis/JarvisOrb'
import JarvisPanel from './shell/jarvis/JarvisPanel'
import IdentityAssuranceSettings from './pages/settings/IdentityAssuranceSettings'
const RecordListView = lazyWithRecovery(() => import('./platform/records/RecordListView'))
const MetadataRecordFormModal = lazyWithRecovery(() => import('./platform/forms/MetadataRecordFormModal'))
const UserStoreAccessModal = lazyWithRecovery(() => import('./components/UserStoreAccessModal'))
const OneDeveloperPage = lazyWithRecovery(() => import('./pages/developer/OneDeveloperPage'))
const MetadataSettingsPage = lazyWithRecovery(() => import('./pages/settings/MetadataSettingsPage'))
const MetadataSettingsSection = lazyWithRecovery(() => import('./pages/settings/MetadataSettingsSection'))
const WorkspacePage = lazyWithRecovery(() => import('./platform/workspace/WorkspacePage'))
const CustomPageRuntimePage = lazyWithRecovery(() => import('./platform/pages/CustomPageRuntimePage'))
const DashboardPage = lazyWithRecovery(() => import('./pages/dashboard/DashboardPage'))
const ProfilePage = lazyWithRecovery(() => import('./pages/profile/ProfilePage'))
const ReportsPage = lazyWithRecovery(() => import('./pages/reports/CustomReportsPage'))
const CustomReportsPage = lazyWithRecovery(() => import('./pages/reports/CustomReportsPage'))
const IntegrationsAdmin = lazyWithRecovery(() => import('./pages/integrations/IntegrationsAdmin'))
const AuditLogPage = lazyWithRecovery(() => import('./pages/audit/AuditLogPage'))
const OneStorePopover = lazyWithRecovery(() => import('./pages/oneStore/OneStorePopover'))
const LicensingAdmin = lazyWithRecovery(() => import('./pages/superadmin/LicensingAdmin'))
const AppReleasesAdmin = lazyWithRecovery(() => import('./pages/superadmin/AppReleasesAdmin'))
const GoogleConnectSettings = lazyWithRecovery(() => import('./pages/settings/GoogleConnectSettings'))
const ConnectorAppSettings = lazyWithRecovery(() => import('./pages/settings/ConnectorAppSettings'))
const SecurityIdentitySettings = lazyWithRecovery(() => import('./pages/settings/SecurityIdentitySettings'))
const MfaAdministrationSettings = lazyWithRecovery(() => import('./pages/settings/MfaAdministrationSettings'))
const SecurityGovernanceSettings = lazyWithRecovery(() => import('./pages/settings/SecurityGovernanceSettings'))
const DataProtectionSettings = lazyWithRecovery(() => import('./pages/settings/DataProtectionSettings'))
const ScreenFlowRuntimePage = lazyWithRecovery(() => import('./pages/flow/ScreenFlowRuntimePage'))
import {
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Wifi,
  Bell,
  Volume2,
  Moon,
  Clock3,
  Settings2,
  Settings as GearIcon,
  CircleUserRound,
  CircleHelp,
  CircleAlert,
  Accessibility,
  Shield,
  Monitor,
  Image,
  BatteryCharging,
  Users,
  KeyRound,
  Globe2,
  Keyboard,
  MousePointer2,
  Printer,
  ChevronLeft, ChevronRight,
  Building2,
  Store,
  ShoppingCart,
  ReceiptText,
  CreditCard,
  HardDrive,
  ShieldCheck,
  Sparkles,
  Cable,
  MonitorCog,
  MonitorSmartphone,
  LayoutGrid,
  Mail,
  ShoppingBag,
  RefreshCw,
  LogOut,
  SunMedium,
  Eye,
  EyeOff,
} from 'lucide-react'



function SettingsPage({ initialSection = '' }) {
  return <MetadataSettingsPage initialSection={initialSection} />
}

function LauncherOverlay({ apps, query, onQueryChange, onClose, onOpenRoute, onOpenStore, loading = false, error = '', onRetry }) {
  const q = String(query || '').trim().toLowerCase()
  const visible = apps
    .filter((item) => item?.visible !== false && item?.system_only !== true)
    .filter((item) => !q || marketplaceSearchText(item).includes(q))

  return (
    <motion.div
      className="launcher-overlay"
      initial={{ opacity: 0, scale: 1.035, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.02, filter: 'blur(8px)' }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div className="launcher-glass">
        <div className="launcher-search">
          <Search size={16} strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="Search apps"
            aria-label="Search launcher apps"
            autoFocus
          />
        </div>

        <div className="launcher-app-grid" role="list" aria-label="oneStore apps">
          {visible.map((item, index) => {
            const icon = appIconUrl(item)
            const route = resolveAppOpenRoute(item)
            const installed = item?.is_installed === true
            const active = item?.launchable === true
            return (
              <motion.button
                key={item.package_key || item.id}
                type="button"
                className="launcher-app"
                role="listitem"
                aria-label={item.name || item.package_key}
                title={installed ? (item.name || item.package_key) : `${item.name || item.package_key} — available in oneStore`}
                initial={{ opacity: 0, y: 18, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', mass: 0.15, stiffness: 250, damping: 20, delay: Math.min(0.22, index * 0.012) }}
                whileHover={{ y: -7, scale: 1.055 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  if (active && route) {
                    onClose?.()
                    onOpenRoute?.(route)
                  } else {
                    onClose?.()
                    onOpenStore?.(item.package_key)
                  }
                }}
              >
                <span className="launcher-app-icon">
                  {icon ? (
                    <img
                      src={icon}
                      alt=""
                      draggable="false"
                      onError={applyDefaultAppIcon}
                    />
                  ) : (
                    <ShoppingBag size={38} strokeWidth={1.6} />
                  )}
                </span>
                <strong>{item.name || item.package_key}</strong>
              </motion.button>
            )
          })}
          {!visible.length ? (
            <div className="launcher-empty">
              {loading ? (
                <>Loading apps…</>
              ) : error ? (
                <>
                  <strong>Unable to load apps</strong>
                  <span>{error}</span>
                  <button type="button" onClick={onRetry}>Retry</button>
                </>
              ) : q ? (
                <>No apps match your search.</>
              ) : (
                <>
                  <strong>No apps returned by oneStore</strong>
                  <span>The catalogue loaded but returned zero visible apps.</span>
                  <button type="button" onClick={onRetry}>Reload apps</button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

function ConnectionMenu({ health, onRefresh }) {
  const isConnected = (value) => String(value || '').trim().toLowerCase() === 'connected'
  const networkOnline = isConnected(health?.status)
  const apiOnline = isConnected(health?.api) || networkOnline
  const databaseOnline = isConnected(health?.database)
  const rows = [
    ['Network', networkOnline ? 'Connected' : (health?.status || 'Offline'), networkOnline],
    ['Server / API', apiOnline ? 'Connected' : (health?.api || 'Unavailable'), apiOnline],
    ['Database', health?.database || 'Unknown', databaseOnline],
  ]
  return (
    <motion.div className="mac-popover connection-menu git-macos-panel" initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}>
      <div className="git-macos-card">
        <div className="git-macos-row git-macos-row--top">
          <span className="git-macos-icon git-macos-icon--blue"><Wifi size={16} /></span>
          <div className="git-macos-copy"><strong>One Network</strong><small>Live connectivity and platform health</small></div>
        </div>
      </div>
      <div className="git-macos-card one-network-health-list">
        {rows.map(([label, value, ok]) => (
          <div className="git-macos-row one-network-health-row" key={label}>
            <span className={`git-macos-status-dot ${ok ? 'is-online' : ''}`} />
            <div className="git-macos-copy"><strong>{label}</strong><small>{value}</small></div>
          </div>
        ))}
      </div>
      <button type="button" className="git-macos-footer-button" onClick={onRefresh}><RefreshCw size={13} /> Refresh status</button>
    </motion.div>
  )
}

function DevicesMenu({ onOpenSettings }) {
  const [devices, setDevices] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(true)

  useEffect(() => {
    let live = true
    apiRequest('/api/health/devices', { timeoutMs: 15000, retryGet: false })
      .then((response) => {
        if (!live) return
        setDevices(Array.isArray(response?.data) ? response.data : [])
      })
      .catch(() => { if (live) setDevices([]) })
      .finally(() => { if (live) setLoadingDevices(false) })
    return () => { live = false }
  }, [])

  const iconFor = (device) => device.deviceType === 'RECEIPT_PRINTER'
    ? Printer
    : device.deviceType === 'PAYMENT_TERMINAL' ? CreditCard : MonitorSmartphone
  const isOnline = (status) => ['CONNECTED','READY','ONLINE','VERIFIED','OK','SUCCESS'].includes(String(status || '').toUpperCase())

  return (
    <motion.div className="mac-popover devices-menu git-macos-panel" initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}>
      <div className="git-macos-card">
        <div className="git-macos-row git-macos-row--top">
          <span className="git-macos-icon git-macos-icon--blue"><MonitorSmartphone size={16} /></span>
          <div className="git-macos-copy"><strong>Connected Devices</strong><small>Only active hardware linked to this workstation.</small></div>
        </div>
      </div>
      <div className="git-macos-section-title">This workstation</div>
      <div className="git-macos-card device-status-list">
        {loadingDevices ? <div className="git-macos-card--center">Checking device health…</div> : devices.length ? devices.map((device) => {
          const Icon = iconFor(device)
          const online = isOnline(device.status)
          return (
            <div className="git-macos-row device-status-row" key={device.id}>
              <span className="git-macos-icon git-macos-icon--gray"><Icon size={15} /></span>
              <div className="git-macos-copy"><strong>{device.name}</strong><small>{String(device.deviceType || 'Device').replaceAll('_',' ')} · {device.message || device.status}{device.live === false ? ' · live probe unavailable' : ''}</small></div>
              <span className={`git-macos-status-dot ${online ? 'is-online' : ''}`} aria-label={online ? 'Connected' : device.status || 'Configured'} />
            </div>
          )
        }) : <div className="git-macos-card--center">No active devices are linked to this workstation.</div>}
      </div>
      <button type="button" className="git-macos-footer-button" onClick={onOpenSettings}>Open Hardware Settings</button>
    </motion.div>
  )
}
function HelpMenu({ onSelect }) {
  const items = [
    ['Getting started', 'Basic onePOS setup and first steps'],
    ['Settings guide', 'Company, store, users and permissions'],
    ['Troubleshooting', 'Connection health and recovery tools'],
    ['System diagnostics', 'Server, database and integration status'],
  ]

  return (
    <motion.div className="mac-popover help-menu git-macos-panel" initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}>
      <div className="git-macos-card">
        <div className="git-macos-row git-macos-row--top">
          <span className="git-macos-icon git-macos-icon--blue"><CircleHelp size={16} /></span>
          <div className="git-macos-copy"><strong>Help & Guides</strong><small>Open the relevant onePOS workspace or diagnostics page.</small></div>
        </div>
      </div>
      <div className="git-macos-section-title">Help</div>
      <div className="git-macos-card help-menu-list">
        {items.map(([label, description]) => (
          <button key={label} type="button" className="git-macos-row help-menu-row" onClick={() => onSelect?.(label)}>
            <span className="git-macos-copy"><strong>{label}</strong><small>{description}</small></span>
            <span className="git-macos-chevron">›</span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}


function ControlCenterMenu({ onOpenWifi, onOpenBluetooth, onLock, onLogout }) {
  const [focusOn, setFocusOn] = useState(false)
  const [volume, setVolume] = useState(58)
  const [brightness, setBrightness] = useState(72)
  return (
    <motion.div
      className="mac-popover control-center-menu git-control-center"
      initial={{ opacity: 0, y: -10, scale: 0.9, transformOrigin: 'top right' }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.94 }}
      transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}
    >
      <div className="git-control-grid">
        <div className="git-control-main">
          <motion.button type="button" className="git-control-line" onClick={onOpenWifi} whileTap={{ scale: .98 }}>
            <span className="git-control-circle is-blue"><Wifi size={16}/></span>
            <span><strong>One Network</strong><small>Network, server and database health</small></span>
            <ChevronRight size={14} className="git-control-row-chevron"/>
          </motion.button>
          <motion.button type="button" className="git-control-line" onClick={onOpenBluetooth} whileTap={{ scale: .98 }}>
            <span className="git-control-circle is-blue"><MonitorSmartphone size={16}/></span>
            <span><strong>Devices</strong><small>Configured hardware</small></span>
            <ChevronRight size={14} className="git-control-row-chevron"/>
          </motion.button>
        </div>
        <div className="git-control-side">
          <motion.button type="button" className={`git-control-tile ${focusOn ? 'is-active' : ''}`} onClick={() => setFocusOn((value) => !value)} whileTap={{ scale: .97 }}>
            <span className={`git-control-circle ${focusOn ? 'is-purple' : ''}`}><Moon size={15}/></span>
            <strong>Focus</strong>
            <small>{focusOn ? 'On' : 'Off'}</small>
          </motion.button>
          <div className="git-control-tile">
            <span className="git-control-circle"><BatteryCharging size={15}/></span>
            <strong>Battery</strong>
            <small>Power</small>
          </div>
        </div>
      </div>

      <div className="git-control-slider-card">
        <div className="git-control-slider-title"><span><SunMedium size={14}/> Display</span><small>{brightness}%</small></div>
        <input className="git-control-volume" type="range" min="10" max="100" value={brightness} aria-label="Display brightness" onChange={(event) => setBrightness(Number(event.target.value))}/>
      </div>
      <div className="git-control-slider-card">
        <div className="git-control-slider-title"><span><Volume2 size={14}/> Sound</span><small>{volume}%</small></div>
        <input className="git-control-volume" type="range" min="0" max="100" value={volume} aria-label="Sound volume" onChange={(event) => setVolume(Number(event.target.value))}/>
      </div>
      <div className="git-control-actions">
        <button type="button" onClick={onLock}><LockKeyhole size={14}/><span>Lock</span></button>
        <button type="button" className="is-danger" onClick={onLogout}><LogOut size={14}/><span>Log Out</span></button>
      </div>
    </motion.div>
  )
}

function Desktop({ onLock, onSignOut }) {
  const now = useClock()
  const [message, setMessage] = useState('Hello.')
  const [activeApp, setActiveApp] = useState(() => readRoute().app)
  const [routeState, setRouteState] = useState(() => readRoute())
  const [topPanel, setTopPanel] = useState('')
  const [launcherOpen, setLauncherOpen] = useState(false)
  const [appSearch, setAppSearch] = useState('')
  const [storeApps, setStoreApps] = useState(() => readMarketplaceCache())
  const [storeFocusPackageKey, setStoreFocusPackageKey] = useState('')
  const [storeAppsLoaded, setStoreAppsLoaded] = useState(() => readMarketplaceCache().length > 0)
  const [storeAppsLoading, setStoreAppsLoading] = useState(false)
  const [storeAppsError, setStoreAppsError] = useState('')
  const [runtimeApps, setRuntimeApps] = useState([])
  const storeRefreshInFlightRef = useRef(null)
  const [connectionHealth, setConnectionHealth] = useState({ status: 'Checking…', api: 'Checking…', database: 'Checking…' })
  const [availableStores, setAvailableStores] = useState(() => getAvailableStores())
  const [activeStoreId, setActiveStoreState] = useState(() => getActiveStoreId())
  const [dashboardStoreId, setDashboardStoreId] = useState('')
  const [desktopPermissions, setDesktopPermissions] = useState(() => {
    const cached = getStoredSessionPermissions()
    return Array.isArray(cached?.permissions) ? cached.permissions : []
  })
  const canManageOneEngine = desktopPermissions.includes('oneengine.manage')
  const requiresEnginePermission = ['developer', 'licensing', 'app-releases'].includes(activeApp)
  const [enginePermissionStatus, setEnginePermissionStatus] = useState(() => getStoredSessionPermissions() ? 'ready' : 'loading')
  const [permissionRetry, setPermissionRetry] = useState(0)
  const enginePermissionNotice = <div className="module-state" role="status">
    {enginePermissionStatus === 'loading' ? 'Checking OneEngine permissions…'
      : enginePermissionStatus === 'error' ? <>Unable to verify OneEngine permissions. <button type="button" onClick={() => setPermissionRetry((value) => value + 1)}>Retry</button></>
        : 'OneEngine Manager permission required.'}
  </div>
  const topbarPanelRef = useRef(null)
  const storedUser = getStoredUser()
  useEffect(() => {
    const syncRoute = () => {
      const route = readRoute()
      setRouteState(route)
      setActiveApp(route.app)
    }
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

  useEffect(() => {
    const openStore = (event) => {
      setAppSearch('')
      setStoreFocusPackageKey(String(event?.detail?.packageKey || ''))
      setTopPanel('store')
    }
    window.addEventListener('onepos:open-store', openStore)
    return () => window.removeEventListener('onepos:open-store', openStore)
  }, [])

  useEffect(() => {
    if (!launcherOpen) return undefined
    const closeEscape = (event) => {
      if (event.key === 'Escape') setLauncherOpen(false)
    }
    document.addEventListener('keydown', closeEscape)
    return () => document.removeEventListener('keydown', closeEscape)
  }, [launcherOpen])

  useEffect(() => {
    if (!topPanel) return undefined
    const closeOutside = (event) => {
      if (!topbarPanelRef.current?.contains(event.target)) setTopPanel('')
    }
    const closeEscape = (event) => {
      if (event.key === 'Escape') setTopPanel('')
    }
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [topPanel])

  useEffect(() => {
    let live = true
    ensureActiveStoreContext()
      .then(({ stores, activeStoreId: selected }) => {
        if (!live) return
        setAvailableStores(Array.isArray(stores) ? stores : [])
        setActiveStoreState(selected || '')
      })
      .catch(() => {
        if (!live) return
        setAvailableStores(getAvailableStores())
        setActiveStoreState(getActiveStoreId())
      })
    return () => { live = false }
  }, [storedUser?.companyId])

  useEffect(() => {
    let live = true
    const cached = getStoredSessionPermissions()
    if (cached && permissionRetry === 0) {
      setDesktopPermissions(Array.isArray(cached?.permissions) ? cached.permissions : [])
      setEnginePermissionStatus('ready')
      return () => { live = false }
    }

    setEnginePermissionStatus('loading')
    loadSessionPermissions({ force: permissionRetry > 0, includeEntitlements: false })
      .then((permissions) => {
        if (!live) return
        setDesktopPermissions(Array.isArray(permissions?.permissions) ? permissions.permissions : [])
        setEnginePermissionStatus('ready')
      })
      .catch(() => {
        if (!live) return
        if (!getStoredSessionPermissions()) setDesktopPermissions([])
        setEnginePermissionStatus('error')
      })
    return () => { live = false }
  }, [permissionRetry])

  useEffect(() => {
    let live = true
    checkBackend()
      .catch(() => null)
      .then((health) => {
        if (!live) return
        document.documentElement.setAttribute('data-onepos-backend', health ? 'connected' : 'offline')
        setConnectionHealth({
          status: health ? 'Connected' : 'Offline',
          api: health ? 'Connected' : 'Unavailable',
          database: health?.database || (health ? 'Connected' : 'Unavailable'),
        })
      })
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (storeApps.length) return
    void refreshStoreApps({ silent: true })
  }, [])

  useEffect(() => {
    let live = true
    apiRequest('/api/platform/runtime/apps')
      .then((response) => { if (live) setRuntimeApps(Array.isArray(response?.data) ? response.data : []) })
      .catch(() => { if (live) setRuntimeApps([]) })
    return () => { live = false }
  }, [storedUser?.companyId])

  const activeRuntimeApp = runtimeApps.find((app) => String(app?.app_key || '') === String(activeApp || '')) || null
  const activeRuntimePage = activeRuntimeApp?.pages?.[0] || null
  const activeRuntimeDefinition = activeRuntimePage?.definition && typeof activeRuntimePage.definition === 'object' ? activeRuntimePage.definition : {}

  const refreshStoreApps = async ({ silent = false, allowCacheFallback = true } = {}) => {
    if (storeRefreshInFlightRef.current) return storeRefreshInFlightRef.current
    const request = (async () => {
      if (!silent) setStoreAppsLoading(true)
      setStoreAppsError('')
      try {
        const packages = await apiRequest('/api/packages/marketplace', { timeoutMs: 12000, retryGet: true })
        const rows = Array.isArray(packages?.data) ? packages.data : []
        setStoreApps(rows)
        writeMarketplaceCache(rows)
        setStoreAppsLoaded(true)
        return rows
      } catch (error) {
        const cached = allowCacheFallback ? readMarketplaceCache() : []
        if (cached.length) {
          setStoreApps(cached)
          setStoreAppsLoaded(true)
        } else {
          setStoreApps([])
          setStoreAppsLoaded(false)
        }
        setStoreAppsError(error?.message || 'Unable to load the live app catalogue. Please retry.')
        return cached
      } finally {
        if (!silent) setStoreAppsLoading(false)
        storeRefreshInFlightRef.current = null
      }
    })()
    storeRefreshInFlightRef.current = request
    return request
  }

  useEffect(() => {
    if (!launcherOpen && topPanel !== 'apps' && topPanel !== 'store') return undefined
    let live = true
    ;(async () => {
      if (!live) return
      await refreshStoreApps({ allowCacheFallback: false })
    })()
    return () => { live = false }
  }, [launcherOpen, topPanel])

  const dateTime = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }).format(now),
    [now],
  )

  const openRoutePath = (route) => {
    const rawValue = String(route || '').trim()
    if (!rawValue) return
    const queryIndex = rawValue.indexOf('?')
    const value = (queryIndex >= 0 ? rawValue.slice(0, queryIndex) : rawValue).trim()
    const searchParams = new URLSearchParams(queryIndex >= 0 ? rawValue.slice(queryIndex + 1) : '')
    if (!value) return
    setTopPanel('')
    setLauncherOpen(false)
    setAppSearch('')
    const parts = value.split('/').filter(Boolean)
    const developerIndex = parts.indexOf('developer')
    if (developerIndex >= 0) {
      const section = parts[developerIndex + 1] || 'objects'
      setRoute('developer', section)
      setRouteState({ app: 'developer', section })
      setActiveApp('developer')
      return
    }
    const settingsIndex = parts.indexOf('settings')
    if (settingsIndex >= 0) {
      const section = parts[settingsIndex + 1] || 'company'
      if (DEVELOPER_SETTINGS_KEYS.has(section)) {
        setRoute('developer', section)
        setRouteState({ app: 'developer', section })
        setActiveApp('developer')
      } else {
        setRoute('settings', section)
        setRouteState({ app: 'settings', section })
        setActiveApp('settings')
      }
      return
    }
    const connectorSettingsIndex = parts.indexOf('connector-settings')
    if (connectorSettingsIndex >= 0) {
      const packageKey = decodeURIComponent(parts[connectorSettingsIndex + 1] || '')
      if (packageKey) {
        setRoute('connector-settings', null, { packageKey })
        setRouteState({ app: 'connector-settings', section: null, packageKey })
        setActiveApp('connector-settings')
      }
      return
    }
    const objectsIndex = parts.indexOf('objects')
    if (objectsIndex >= 0 && parts[objectsIndex + 1]) {
      const objectKey = decodeURIComponent(parts[objectsIndex + 1] || '')
      const recordId = parts[objectsIndex + 2] === 'records' && parts[objectsIndex + 3]
        ? decodeURIComponent(parts[objectsIndex + 3])
        : ''
      const appKey = searchParams.get('appKey') || ''
      const next = { app: 'workspace', section: null, objectKey, recordId, appKey }
      setRoute('workspace', null, { objectKey, recordId, appKey })
      setRouteState(next)
      setActiveApp('workspace')
      return
    }
    const appIndex = parts.indexOf('app')
    const slug = parts[appIndex >= 0 ? appIndex + 1 : parts.length - 1]
    if (slug) openItem(slug)
  }

  const openItem = (id) => {
    const aliases = {
      platform: 'developer',
      builder: 'developer',
      one_connect_google: 'google-connect',
      one_assistant: 'assistant',
    }
    const target = aliases[id] || id

    if (target === 'launchpad') {
      setAppSearch('')
      setTopPanel('')
      setLauncherOpen(true)
      return
    }
    if (target === 'store') {
      setAppSearch('')
      setLauncherOpen(false)
      setStoreFocusPackageKey('')
      setTopPanel('store')
      return
    }

    // Any app navigation must dismiss the Launchpad first. Without this,
    // dock shortcuts can change the route behind the full-screen overlay.
    setLauncherOpen(false)
    setAppSearch('')
    setTopPanel('')

    if (target === 'developer') {
      const next = { app: 'developer', section: 'objects' }
      setRoute('developer', 'objects')
      setRouteState(next)
      setActiveApp('developer')
      return
    }
    if (target === 'settings') {
      const section = readRoute().section || 'company'
      const next = { app: 'settings', section }
      setRoute('settings', section)
      setRouteState(next)
      setActiveApp('settings')
      return
    }
    if (runtimeApps.some((app) => String(app?.app_key || '') === String(target))) {
      const next = { app: target, section: null }
      setRoute(target)
      setRouteState(next)
      setActiveApp(target)
      return
    }

    const item = dockItems.find((entry) => entry.id === id) ?? null
    setMessage(`${item?.label ?? 'App'} is not available in this workspace.`)
  }

  return (
    <main className="screen desktop-screen" data-oneengine-route={activeApp} data-oneengine-section={routeState?.section || ""} data-oneengine-object={routeState?.objectKey || ""} data-oneengine-page={routeState?.pageKey || ""}>
      <header className="demo-menubar" ref={topbarPanelRef}>
        <div className="menubar-left">
          <button
            type="button"
            className="brand-chip one-brand"
            onClick={() => { setMessage('Hello.'); setRoute('home'); setActiveApp('home') }}
            aria-label="One Solutions"
          >
            <img className="one-logo-play" src={`${import.meta.env.BASE_URL || '/'}icons/one-solutions-mark.svg`} alt="" draggable="false" />
          </button>

          <div className="topbar-search-wrap topbar-search-wrap--left">
            <motion.label
              className="topbar-search-pill"
              animate={{ width: topPanel === 'apps' ? 360 : 210 }}
              transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}
            >
              <Search size={14} strokeWidth={2.1} />
              <input
                value={appSearch}
                onFocus={() => setTopPanel('apps')}
                onChange={(event) => { setAppSearch(event.target.value); setTopPanel('apps') }}
                placeholder="Search One Store"
                aria-label="Search One Store"
              />
            </motion.label>
            <AnimatePresence>
              {topPanel === 'apps' ? (
                <TopbarAppsMenu
                  apps={storeApps}
                  query={appSearch}
                  mode="launcher"
                  loading={storeAppsLoading}
                  error={storeAppsError}
                  onRetry={() => refreshStoreApps()}
                  onClose={() => setTopPanel('')}
                  onOpenRoute={openRoutePath}
                  onOpenStore={(packageKey) => {
                    setStoreFocusPackageKey(packageKey || '')
                    setTopPanel('store')
                  }}
                />
              ) : null}
              {topPanel === 'store' ? (
                <OneStorePopover
                  initialPackages={storeApps}
                  initialSelectedPackageKey={storeFocusPackageKey}
                  onPackagesChange={setStoreApps}
                  canManagePackages={
                    desktopPermissions.includes('package.install') ||
                    desktopPermissions.includes('package.manage') ||
                    desktopPermissions.includes('settings.manage') ||
                    (desktopPermissions.includes('oneengine.manage'))
                  }
                  onClose={() => setTopPanel('')}
                  onOpenRoute={openRoutePath}
                />
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <div className="menubar-spacer" />

        <div className="menubar-right">
          {availableStores.length ? (
            <label className="topbar-store-context" title={activeApp === 'dashboard' ? 'Dashboard store scope' : 'Active store'}>
              <Store size={14} strokeWidth={2.1} />
              <select
                aria-label={activeApp === 'dashboard' ? 'Dashboard store scope' : 'Active store'}
                value={activeApp === 'dashboard' && availableStores.length > 1 ? dashboardStoreId : activeStoreId}
                onChange={(event) => {
                  const nextStoreId = event.target.value
                  if (activeApp === 'dashboard' && availableStores.length > 1) {
                    setDashboardStoreId(nextStoreId)
                    window.dispatchEvent(new CustomEvent('onepos:dashboard-store-scope-changed', { detail: { storeId: nextStoreId } }))
                    return
                  }
                  setActiveStoreId(nextStoreId)
                  setActiveStoreState(nextStoreId)
                  const currentUser = getStoredUser()
                  sessionStorage.setItem('onepos_user', JSON.stringify({ ...currentUser, storeId: nextStoreId || null }))
                }}
              >
                {activeApp === 'dashboard' && availableStores.length > 1 ? <option value="">All</option> : null}
                {availableStores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name || store.code || 'Store'}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="topbar-status-wrap">
            <button type="button" className={`status-button ${topPanel === 'wifi' ? 'is-active' : ''}`} aria-label="Connection health" aria-expanded={topPanel === 'wifi'} onClick={() => setTopPanel(topPanel === 'wifi' ? '' : 'wifi')}>
              <Wifi size={17} strokeWidth={2.1} />
            </button>
            <AnimatePresence>
              {topPanel === 'wifi' ? <ConnectionMenu health={connectionHealth} onRefresh={async () => {
                const health = await checkBackend().catch(() => null)
                setConnectionHealth({ status: health ? 'Connected' : 'Offline', api: health ? 'Connected' : 'Unavailable', database: health?.database || (health ? 'Connected' : 'Unavailable') })
              }} /> : null}
            </AnimatePresence>
          </div>
          <div className="topbar-status-wrap">
            <button type="button" className={`status-button ${topPanel === 'bluetooth' ? 'is-active' : ''}`} aria-label="Devices" aria-expanded={topPanel === 'bluetooth'} onClick={() => setTopPanel(topPanel === 'bluetooth' ? '' : 'bluetooth')}>
              <MonitorSmartphone size={17} strokeWidth={2.1} />
            </button>
            <AnimatePresence>
              {topPanel === 'bluetooth' ? <DevicesMenu onOpenSettings={() => { setRoute('settings', 'hardware'); setActiveApp('settings'); setTopPanel('') }} /> : null}
            </AnimatePresence>
          </div>
          <div className="topbar-status-wrap">
            <button type="button" className={`status-button ${topPanel === 'help' ? 'is-active' : ''}`} aria-label="Help & Guides" aria-expanded={topPanel === 'help'} title="Help & Guides" onClick={() => setTopPanel(topPanel === 'help' ? '' : 'help')}>
              <CircleHelp size={17} strokeWidth={2.1} />
            </button>
            <AnimatePresence>
              {topPanel === 'help' ? <HelpMenu onSelect={(label) => {
                setTopPanel('')
                if (label === 'Settings guide' || label === 'Getting started') { setRoute('settings'); setRouteState({ app: 'settings', section: null }); setActiveApp('settings') }
                else { setRoute('settings'); setRouteState({ app: 'settings', section: null }); setActiveApp('settings') }
              }} /> : null}
            </AnimatePresence>
          </div>
          <div className="topbar-status-wrap">
            <button type="button" className={`status-button ${topPanel === 'control' ? 'is-active' : ''}`} aria-label="Control Center" aria-expanded={topPanel === 'control'} onClick={() => setTopPanel(topPanel === 'control' ? '' : 'control')}>
              <SlidersHorizontal size={18} strokeWidth={2.2} />
            </button>
            <AnimatePresence>
              {topPanel === 'control' ? <ControlCenterMenu onOpenWifi={() => setTopPanel('wifi')} onOpenBluetooth={() => setTopPanel('bluetooth')} onLock={() => { setTopPanel(''); onLock?.() }} onLogout={() => { setTopPanel(''); onSignOut?.() }} /> : null}
            </AnimatePresence>
          </div>
          <button
            type="button"
            className="status-button"
            aria-label="Open Settings"
            title="Settings"
            onClick={() => { setTopPanel(''); setRoute('settings', 'company'); setActiveApp('settings') }}
          >
            <GearIcon size={17} strokeWidth={2.1} />
          </button>
          <button
            type="button"
            className="status-button"
            aria-label="Log out"
            title="Log Out"
            onClick={() => { setTopPanel(''); onSignOut?.() }}
          >
            <LogOut size={17} strokeWidth={2.1} />
          </button>
          <MenuBarClock />
        </div>
      </header>

      <AnimatePresence>
        {launcherOpen ? (
          <LauncherOverlay
            apps={storeApps}
            query={appSearch}
            onQueryChange={setAppSearch}
            loading={storeAppsLoading}
            error={storeAppsError}
            onRetry={() => refreshStoreApps()}
            onClose={() => setLauncherOpen(false)}
            onOpenRoute={openRoutePath}
            onOpenStore={(packageKey) => {
              setAppSearch('')
              setStoreFocusPackageKey(packageKey || '')
              setTopPanel('store')
            }}
          />
        ) : null}
      </AnimatePresence>

      <LazyLoadBoundary resetKey={`${activeApp || ""}:${routeState?.section || ""}`}>
      <Suspense key={activeStoreId || 'no-store'} fallback={<div className="route-loading" role="status">Loading…</div>}>
        {activeApp === 'developer' ? (
          enginePermissionStatus === 'ready' && canManageOneEngine ? (
            <OneDeveloperPage
              initialSection={routeState?.section || 'objects'}
              initialWorkflowId={routeState?.workflowId || ''}
              onSectionChange={(section, options = {}) => {
                const next = { app: 'developer', section, workflowId: options?.workflowId || '' }
                setRouteState(next)
                setRoute('developer', section, options)
              }}
            />
          ) : enginePermissionNotice
        ) : activeApp === 'settings' ? (
          <SettingsPage initialSection={routeState?.section || ''} />
        ) : activeApp === 'google-connect' ? (
          <GoogleConnectSettings />
        ) : activeApp === 'connector-settings' ? (
          <ConnectorAppSettings packageKey={routeState?.packageKey || ''} onBack={() => { setTopPanel('store'); setActiveApp('home'); setRoute('home') }} />
        ) : activeRuntimeApp && activeRuntimePage ? (
          ['object','list_view'].includes(String(activeRuntimePage.page_type || 'object')) ? (
            <WorkspacePage initialObjectKey={activeRuntimeDefinition.objectKey || activeRuntimeDefinition.object_key || ''} appKey={activeRuntimeApp.app_key || ''} onNavigate={openItem} />
          ) : (
            <CustomPageRuntimePage pageKey={activeRuntimePage.page_key || ''} />
          )
        ) : activeApp === 'audit-log' ? (
          <AuditLogPage />
        ) : activeApp === 'licensing' ? (
          enginePermissionStatus === 'ready' && canManageOneEngine ? <div className="superadmin-theme"><LicensingAdmin /></div> : enginePermissionNotice
        ) : activeApp === 'app-releases' ? (
          enginePermissionStatus === 'ready' && canManageOneEngine ? <div className="superadmin-theme"><AppReleasesAdmin /></div> : enginePermissionNotice
        ) : activeApp === 'profile' ? (
          <ProfilePage onBack={() => {
            const next = { app: 'settings', section: 'company' }
            setRouteState(next)
            setRoute('settings', 'company')
            setActiveApp('settings')
          }} />
        ) : activeApp === 'custom-page-runtime' ? (
          <CustomPageRuntimePage pageKey={routeState.pageKey || ''} />
        ) : activeApp === 'workspace' ? (
          <WorkspacePage
            initialObjectKey={routeState.objectKey || ''}
            initialRecordId={routeState.recordId || ''}
            appKey={routeState.appKey || ''}
            onNavigate={openItem}
            onRouteChange={(objectKey, recordId) => {
              const appKey = routeState.appKey || ''
              const next = { app: 'workspace', section: null, objectKey, recordId, appKey }
              setRouteState(next)
              setRoute('workspace', null, { objectKey, recordId, appKey })
            }}
          />
        ) : activeApp === 'home' || activeApp === 'dashboard' ? (
          <DashboardPage />
        ) : (
          <div className="module-state" role="alert">This app is not available in this workspace.</div>
        )}
      </Suspense>
      </LazyLoadBoundary>

      <RdvnReferenceDock onItemOpen={openItem} />
    </main>
  )
}

export default function App() {
  const route = readRoute()
  if (route.app === 'flow-runtime') {
    return <div data-oneengine-route="flow-runtime" data-oneengine-session={route.sessionId || ""}><LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading flow…</div>}><ScreenFlowRuntimePage sessionId={route.sessionId} /></Suspense></LazyLoadBoundary></div>
  }

  // A browser refresh should restore an authenticated session, not behave like
  // an explicit workstation lock. PIN is only required after the user chooses
  // Lock during the current session.
  const [locked, setLocked] = useState(() => !hasSession())
  const [sessionContextReady, setSessionContextReady] = useState(() => !hasSession() || hasSessionContext())
  const [pendingUnlock, setPendingUnlock] = useState(false)

  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    if (!hasSession()) {
      setSessionContextReady(true)
      return
    }

    let live = true
    const alreadyReady = hasSessionContext()
    if (!alreadyReady) setSessionContextReady(false)

    // Cached authenticated context renders immediately. A server bootstrap is
    // only blocking when this browser genuinely has no usable session context
    // (for example after an OAuth callback in a fresh tab).
    ensureActingCompanyContext()
      .catch(() => '')
      .finally(() => {
        if (live) setSessionContextReady(true)
      })

    return () => { live = false }
  }, [])

  const unlock = () => {
    if (transitioning || pendingUnlock) return
    setSessionContextReady(true)
    setPendingUnlock(true)
    setTransitioning(true)

    // Keep the unlock transition timer outside an effect whose dependency
    // changes would cancel its own cleanup timer. The previous implementation
    // set transitioning=true inside the effect, causing React to clean up that
    // effect immediately and clear the timeout before locked could become false.
    window.setTimeout(() => {
      setLocked(false)
      setPendingUnlock(false)
      setTransitioning(false)
    }, 180)
  }

  const lock = () => {
    if (transitioning) return
    setTransitioning(true)
    window.setTimeout(() => {
      setLocked(true)
      setTransitioning(false)
    }, 260)
  }

  const signOut = () => {
    logout()
    setLocked(true)
  }

  return (
    <div className={`app-shell ${transitioning ? 'is-transitioning' : ''}`}>
      {locked ? (
        pendingUnlock && !sessionContextReady
          ? <CompanyContextLoading />
          : <LockScreen onUnlock={unlock} onSignOut={signOut} preparing={pendingUnlock && !sessionContextReady} />
      ) : !sessionContextReady ? (
        <CompanyContextLoading />
      ) : (
        <Desktop onLock={lock} onSignOut={signOut} />
      )}
    </div>
  )
}
