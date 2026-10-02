import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { apiRequest, checkBackend, consumeGoogleOAuthCallback, ensureActingCompanyContext, ensureActiveStoreContext, getActiveStoreId, getAvailableStores, getStoredSessionPermissions, getStoredUser, hasSession, loadSessionPermissions, login, logout, setActiveStoreId, startGoogleLogin, verifyPin } from './services/api'
import { DEVELOPER_SETTINGS_KEYS, readRoute, setRoute } from './navigation/routes'
import { Dock, MenuBarClock, dockItems, useClock } from './components/shell/DesktopDock'
import { CompanyContextLoading, LockScreen } from './components/shell/LoginShell'
import { createRole, loadPermissions, loadRolePermissions, loadRoles, loadSettingsCatalog, loadSettingsContext, loadUsers, patchCompanySettings, patchSettings, readSettingsContextCache, saveRolePermissions, updateRole } from './services/settings'
import { settingSectionAccess, sectionIsVisible } from './utils/settingsAccess'
import { appIconUrl, applyDefaultAppIcon, localAppIcon, marketplaceSearchText, readMarketplaceCache, resolveAppOpenRoute, writeMarketplaceCache } from './utils/appMarketplace'
import JarvisOrb, { ORB_STATES } from './components/jarvis/JarvisOrb'
import JarvisPanel from './components/jarvis/JarvisPanel'
const CHUNK_RELOAD_KEY = 'onepos:lazy-chunk-reload'

function lazyWithRecovery(loader) {
  return lazy(async () => {
    try {
      const module = await loader()
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      return module
    } catch (error) {
      const message = String(error?.message || error || '')
      const isChunkLoadFailure = /failed to fetch dynamically imported module|importing a module script failed|loading chunk .* failed|error loading dynamically imported module/i.test(message)
      if (isChunkLoadFailure && window.sessionStorage.getItem(CHUNK_RELOAD_KEY) !== '1') {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
        window.location.reload()
        return new Promise(() => {})
      }
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      throw error
    }
  })
}

class LazyLoadBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Lazy-loaded page failed', error)
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  retry = () => {
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
      const url = new URL(window.location.href)
      url.searchParams.set('_refresh', Date.now().toString())
      window.location.replace(url.toString())
    } catch {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="route-loading" role="alert">
        <span>Unable to load this page. <strong>Error OEFL01</strong></span>
        <button type="button" onClick={this.retry}>Retry</button>
      </div>
    )
  }
}

const RecordListView = lazyWithRecovery(() => import('./components/RecordListView'))
const MetadataRecordFormModal = lazyWithRecovery(() => import('./components/MetadataRecordFormModal'))
const UserStoreAccessModal = lazyWithRecovery(() => import('./components/UserStoreAccessModal'))
const OneDeveloperPage = lazyWithRecovery(() => import('./pages/developer/OneDeveloperPage'))
const MetadataSettingsPage = lazyWithRecovery(() => import('./pages/settings/MetadataSettingsPage'))
const ClientWebShopSettings = lazyWithRecovery(() => import('./pages/settings/ClientWebShopSettings'))
const PaymentTerminalSettings = lazyWithRecovery(() => import('./pages/settings/PaymentTerminalSettings'))
const HardwareSettings = lazyWithRecovery(() => import('./pages/settings/HardwareSettings'))
const AiAssistantSettings = lazyWithRecovery(() => import('./pages/settings/AiAssistantSettings'))
const ConnectionsSettings = lazyWithRecovery(() => import('./pages/settings/ConnectionsSettings'))
const TillPage = lazyWithRecovery(() => import('./pages/till/TillPage'))
const CustomerDisplay = lazyWithRecovery(() => import('./pages/till/CustomerDisplay'))
const WorkspacePage = lazyWithRecovery(() => import('./pages/workspace/WorkspacePage'))
const CustomPageRuntimePage = lazyWithRecovery(() => import('./pages/platform/CustomPageRuntimePage'))
const DashboardPage = lazyWithRecovery(() => import('./pages/dashboard/DashboardPage'))
const ProfilePage = lazyWithRecovery(() => import('./pages/profile/ProfilePage'))
const SalesPage = lazyWithRecovery(() => import('./pages/sales/SalesPage'))
const ReturnsPage = lazyWithRecovery(() => import('./pages/returns/ReturnsPage'))
const ExchangePage = lazyWithRecovery(() => import('./pages/returns/ExchangePage'))
const LayawayPage = lazyWithRecovery(() => import('./pages/sales/LayawayPage'))
const SupplierReturnsPage = lazyWithRecovery(() => import('./pages/returns/SupplierReturnsPage'))
const ProductsPage = lazyWithRecovery(() => import('./pages/products/ProductsPage'))
const CategoriesPage = lazyWithRecovery(() => import('./pages/products/CategoriesPage'))
const GlobalProductLookupPage = lazyWithRecovery(() => import('./pages/products/GlobalProductLookupPage'))
const InventoryPage = lazyWithRecovery(() => import('./pages/inventory/InventoryPage'))
const ReplenishmentPage = lazyWithRecovery(() => import('./pages/inventory/ReplenishmentPage'))
const PurchasesPage = lazyWithRecovery(() => import('./pages/purchases/PurchasesPage'))
const SuppliersPage = lazyWithRecovery(() => import('./pages/suppliers/SuppliersPage'))
const CustomersPage = lazyWithRecovery(() => import('./pages/customers/CustomersPage'))
const GiftCardsPage = lazyWithRecovery(() => import('./pages/customers/GiftCardsPage'))
const AttendancePage = lazyWithRecovery(() => import('./pages/employees/AttendancePage'))
const StoresPage = lazyWithRecovery(() => import('./pages/stores/StoresPage'))
const ReportsPage = lazyWithRecovery(() => import('./pages/reports/ReportsPage'))
const CustomReportsPage = lazyWithRecovery(() => import('./pages/reports/CustomReportsPage'))
const IntegrationsAdmin = lazyWithRecovery(() => import('./pages/integrations/IntegrationsAdmin'))
const AccountingAdmin = lazyWithRecovery(() => import('./pages/integrations/AccountingAdmin'))
const OnlineOrdersAdmin = lazyWithRecovery(() => import('./pages/online/OnlineOrdersAdmin'))
const OnlineOrdersPrep = lazyWithRecovery(() => import('./pages/online/OnlineOrdersPrep'))
const OwnDeliveryWorkspace = lazyWithRecovery(() => import('./pages/online/OwnDeliveryWorkspace'))
const ReturnsAdmin = lazyWithRecovery(() => import('./pages/returns/ReturnsAdmin'))
const SupplierReturnsAdmin = lazyWithRecovery(() => import('./pages/returns/ReturnsAdmin').then((module) => ({ default: module.SupplierReturnsAdmin })))
const AuditLogPage = lazyWithRecovery(() => import('./pages/audit/AuditLogPage'))
const OneStorePopover = lazyWithRecovery(() => import('./pages/oneStore/OneStorePopover'))
const LicensingAdmin = lazyWithRecovery(() => import('./pages/superadmin/LicensingAdmin'))
const AppReleasesAdmin = lazyWithRecovery(() => import('./pages/superadmin/AppReleasesAdmin'))
const StoreTillSettingsPage = lazyWithRecovery(() => import('./pages/settings/StoreTillSettingsPage'))
const GoogleConnectSettings = lazyWithRecovery(() => import('./pages/settings/GoogleConnectSettings'))
const ConnectorAppSettings = lazyWithRecovery(() => import('./pages/settings/ConnectorAppSettings'))
const DeliverySettingsPage = lazyWithRecovery(() => import('./pages/settings/DeliverySettingsPage'))
const WhatsAppAssistantSettings = lazyWithRecovery(() => import('./pages/settings/WhatsAppAssistantSettings'))
const SecurityIdentitySettings = lazyWithRecovery(() => import('./pages/settings/SecurityIdentitySettings'))
const MfaAdministrationSettings = lazyWithRecovery(() => import('./pages/settings/MfaAdministrationSettings'))
const SecurityGovernanceSettings = lazyWithRecovery(() => import('./pages/settings/SecurityGovernanceSettings'))
const DataProtectionSettings = lazyWithRecovery(() => import('./pages/settings/DataProtectionSettings'))
const OneAssistantPage = lazyWithRecovery(() => import('./pages/assistant/OneAssistantPage'))
const OneKioskPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskPage'))
const OneKioskDisplayPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskDisplayPage'))
const OneKioskDevicesPage = lazyWithRecovery(() => import('./pages/kiosk/OneKioskDevicesPage'))
const PublicAppointmentBookingPage = lazyWithRecovery(() => import('./pages/assistant/PublicAppointmentBookingPage'))
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



const SETTINGS_VISUALS = {
  general: { icon: Settings2, tone: 'orange', searchTerms: ['date format', 'currency', 'timezone', 'regional'] },
  company: { icon: Building2, tone: 'blue', searchTerms: ['company name', 'legal name', 'company email', 'company phone', 'logo'] },
  'store-till': { icon: Store, tone: 'blue', searchTerms: ['store', 'till', 'terminal', 'terminal number', 'product view', 'invoice'] },
  'client-web-shop': { icon: ShoppingCart, tone: 'green' },
  'tax-vat': { icon: ReceiptText, tone: 'green', searchTerms: ['vat', 'tax', 'vat enabled', 'default vat rate', 'rate'] },
  receipts: { icon: ReceiptText, tone: 'green' },
  'payment-terminals': { icon: CreditCard, tone: 'green' },
  'customer-loyalty': { icon: Sparkles, tone: 'purple', searchTerms: ['loyalty', 'earning rate', 'points', 'redeem', 'rewards'] },
  hardware: { icon: HardDrive, tone: 'gray' },
  users: { icon: Users, tone: 'blue', searchTerms: ['user', 'username', 'email', 'role', 'store', 'active', 'inactive'] },
  'roles-permissions': { icon: ShieldCheck, tone: 'blue', searchTerms: ['role', 'permission', 'permissions', 'parent role', 'system role', 'custom role'] },
  'security-identity': { icon: Shield, tone: 'blue', searchTerms: ['security', 'identity', 'ip range', 'trusted network', 'login hours', 'password policy', 'session', 'login history'] },
  'mfa-administration': { icon: ShieldCheck, tone: 'blue', searchTerms: ['mfa', 'verification', 'temporary code', 'trusted device'] },
  'identity-verification-history': { icon: ShieldCheck, tone: 'blue', searchTerms: ['identity verification history', 'mfa audit', 'verification events', 'step up'] },
  'security-governance': { icon: ShieldCheck, tone: 'blue', searchTerms: ['security health', 'oauth', 'connected apps', 'trusted origins', 'credential vault', 'certificates', 'keys'] },
  'data-protection': { icon: ShieldCheck, tone: 'blue', searchTerms: ['data export', 'retention', 'privacy', 'email security', 'dkim', 'delegated administration'] },
  'ai-assistant': { icon: Sparkles, tone: 'purple' },
  connections: { icon: Cable, tone: 'purple' },
  'uber-eats': { icon: Cable, tone: 'purple' },
  deliveroo: { icon: Cable, tone: 'purple' },
  whatsapp: { icon: Cable, tone: 'green' },
  'whatsapp-assistant': { icon: Cable, tone: 'green' },
  'sms-delivery': { icon: CreditCard, tone: 'pink' },
  'email-delivery': { icon: Mail, tone: 'pink' },
  'server-api': { icon: MonitorCog, tone: 'gray' },
  objects: { icon: LayoutGrid, tone: 'cyan', searchTerms: ['objects', 'object manager', 'fields', 'metadata', 'api name'] },
  'assignment-rules': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['assignment rules', 'routing', 'owner', 'assign'] },
  'sharing-rules': { icon: ShieldCheck, tone: 'cyan', searchTerms: ['sharing rules', 'record access', 'sharing', 'permissions'] },
  platform: { icon: LayoutGrid, tone: 'cyan', searchTerms: ['workflow', 'approval flow', 'page builder', 'dashboard builder', 'report builder', 'canvas', 'components'] },
  'workflow-builder': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['workflow builder', 'automation', 'flow'] },
  'approval-builder': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['approval flow builder', 'approval'] },
  'page-builder': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['page builder', 'canvas', 'page'] },
  'dashboard-builder': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['dashboard builder', 'dashboard'] },
  'report-builder': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['report builder', 'report'] },
  'workflow-runs': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['workflow', 'runs', 'automation', 'history'] },
  'work-items': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['work items', 'workflow', 'approval', 'tasks'] },
  'platform-apps': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['platform apps', 'apps', 'metadata'] },
  deployments: { icon: LayoutGrid, tone: 'cyan', searchTerms: ['deployments', 'release', 'promotion'] },
  notifications: { icon: Bell, tone: 'cyan', searchTerms: ['notification subscriptions', 'events'] },
  'value-sets': { icon: LayoutGrid, tone: 'cyan', searchTerms: ['value sets', 'picklist', 'reusable values'] },
  'message-templates': { icon: Mail, tone: 'pink', searchTerms: ['message templates', 'email template', 'sms template', 'whatsapp template'] },
}

const SETTINGS_NAV_CACHE_KEY = 'onepos.settings.nav.v1'

function settingsNavSlug(value) {
  return String(value || 'settings').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function readSettingsNavCache() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SETTINGS_NAV_CACHE_KEY) || 'null')
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object' && Array.isArray(value.sections)) return value
    return []
  } catch {
    return []
  }
}

function writeSettingsNavCache(value) {
  try {
    const valid = Array.isArray(value) || (value && typeof value === 'object' && Array.isArray(value.sections))
    sessionStorage.setItem(SETTINGS_NAV_CACHE_KEY, JSON.stringify(valid ? value : []))
  } catch {}
}



function settingsVisual(label, explicitKey = '') {
  const labelSlug = settingsNavSlug(label)
  const key = explicitKey || labelSlug
  const visual = SETTINGS_VISUALS[key] || {}
  return {
    key,
    icon: visual.icon || Settings2,
    tone: visual.tone || 'gray',
    searchTerms: visual.searchTerms || [],
    developer: DEVELOPER_SETTINGS_KEYS.has(key),
  }
}

function buildSettingsGroupsFromCatalog(catalog) {
  if (catalog && !Array.isArray(catalog) && Array.isArray(catalog.sections)) {
    const groupDefinitions = Array.isArray(catalog.groups) ? catalog.groups : []
    const groupLabels = new Map(groupDefinitions.map((group) => [String(group.key), String(group.label || group.key)]))
    const grouped = new Map()

    for (const section of catalog.sections) {
      if (!section?.key || !section?.label) continue
      const groupKey = String(section.groupKey || 'settings')
      const groupLabel = groupLabels.get(groupKey) || groupKey
      if (DEVELOPER_SETTINGS_KEYS.has(String(section.key)) || ['developer', 'platform'].includes(groupKey.toLowerCase()) || ['developer', 'platform'].includes(groupLabel.toLowerCase())) continue
      if (!grouped.has(groupLabel)) grouped.set(groupLabel, [])
      grouped.get(groupLabel).push({
        ...settingsVisual(section.label, section.key),
        label: section.label,
        action: section.action || null,
        description: section.description || '',
      })
    }

    return Array.from(grouped.values())
  }

  if (!Array.isArray(catalog) || catalog.length === 0) return []
  const grouped = new Map()
  const seen = new Set()

  const push = (group, item) => {
    if (!item?.key || seen.has(item.key)) return
    seen.add(item.key)
    const groupKey = group || 'Settings'
    if (!grouped.has(groupKey)) grouped.set(groupKey, [])
    grouped.get(groupKey).push(item)
  }

  for (const object of catalog) {
    if (object?.permissions?.can_view === false) continue
    const config = object?.config || {}
    const sectioned = config.settingsSectionSource === 'field-config' || config.settings_section_source === 'field-config'

    if (sectioned) {
      for (const field of Array.isArray(object?.fields) ? object.fields : []) {
        if (field?.active === false || field?.readable === false) continue
        const fieldConfig = field?.config || {}
        const label = fieldConfig.settingsSection || fieldConfig.settings_section || 'General'
        const explicitKey = fieldConfig.settingsKey || fieldConfig.settings_key || ''
        const visual = settingsVisual(label, explicitKey)
        const targetGroup = fieldConfig.settingsGroup || fieldConfig.settings_group || config.settingsGroup || config.settings_group || 'Settings'
        if (!visual.developer && !['developer', 'platform'].includes(String(targetGroup).toLowerCase())) {
          push(targetGroup, { ...visual, label })
        }
      }
      continue
    }

    const label = config.settingsLabel || config.settings_label || object?.label || object?.name || object?.object_key || object?.api_name
    if (!label) continue
    const explicitKey = config.settingsRouteKey || config.settings_route_key || config.settingsKey || config.settings_key || ''
    const visual = settingsVisual(label, explicitKey)
    const targetGroup = config.settingsGroup || config.settings_group || 'Settings'
    if (!visual.developer && !['developer', 'platform'].includes(String(targetGroup).toLowerCase())) {
      push(targetGroup, { ...visual, label })
    }
  }

  return [...grouped.values()].filter((group) => group.length)
}


function compressCompanyLogo(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('')
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const maxSize = 200
        let { width, height } = img
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width)
          width = maxSize
        } else if (height >= width && height > maxSize) {
          width = Math.round((width * maxSize) / height)
          height = maxSize
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/png', 0.85))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to read logo image'))
    }
    img.src = objectUrl
  })
}

function SettingsPage({ onOpenProfile }) {
  const [active, setActive] = useState(() => readRoute().section || 'company')
  const [query, setQuery] = useState('')
  const [context, setContext] = useState(() => readSettingsContextCache())
  const [loading, setLoading] = useState(() => !readSettingsContextCache())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [userEditor, setUserEditor] = useState(null)
  const [userStoreEditor, setUserStoreEditor] = useState(null)
  const [jarvesState, setJarvesState] = useState(null)
  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState('')
  const [permissionCatalog, setPermissionCatalog] = useState([])
  const [recordDialog, setRecordDialog] = useState(null)
  const [recordForm, setRecordForm] = useState({})
  const [recordSaving, setRecordSaving] = useState(false)
  const [settingsCatalog, setSettingsCatalog] = useState(() => readSettingsNavCache())
  const [settingsCatalogLoaded, setSettingsCatalogLoaded] = useState(false)
  const [settingsCatalogError, setSettingsCatalogError] = useState('')
  const [mobileSettingsDetail, setMobileSettingsDetail] = useState(() => Boolean(readRoute().section && readRoute().section !== 'company'))
  const settingsOpenStartedAt = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now())
  const settingsVisibleLogged = useRef(false)
  const settingsStartedWithCache = useRef(Boolean(readSettingsContextCache()))
  const settings = context?.settings
  const user = context?.user || getStoredUser()

  const load = async () => {
    const cached = readSettingsContextCache()
    try {
      // Stale-while-revalidate: cached Settings render immediately; the
      // authoritative server context refreshes quietly in the background.
      if (!cached) setLoading(true)
      setError('')
      const nextContext = await loadSettingsContext()
      setContext(nextContext)
    } catch (err) {
      // Keep a usable cached screen visible during a transient network issue.
      if (!cached) setError(err?.message || 'Unable to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    let live = true
    setSettingsCatalogError('')

    loadSettingsCatalog()
      .then((rows) => {
        if (!live) return
        const hasEntries = Array.isArray(rows)
          ? rows.length > 0
          : Boolean(rows && typeof rows === 'object' && Array.isArray(rows.sections) && rows.sections.length > 0)
        if (hasEntries) {
          writeSettingsNavCache(rows)
          setSettingsCatalog(rows)
          return
        }

        const cached = readSettingsNavCache()
        const hasCachedEntries = Array.isArray(cached)
          ? cached.length > 0
          : Boolean(cached && typeof cached === 'object' && Array.isArray(cached.sections) && cached.sections.length > 0)
        if (!hasCachedEntries) setSettingsCatalogError('Settings catalogue is unavailable.')
      })
      .catch((catalogError) => {
        if (!live) return
        const cached = readSettingsNavCache()
        const hasCachedEntries = Array.isArray(cached)
          ? cached.length > 0
          : Boolean(cached && typeof cached === 'object' && Array.isArray(cached.sections) && cached.sections.length > 0)
        if (!hasCachedEntries) {
          setSettingsCatalogError(catalogError?.message || 'Unable to load Settings catalogue.')
        }
      })
      .finally(() => {
        if (live) setSettingsCatalogLoaded(true)
      })

    return () => {
      live = false
    }
  }, [])

  const permissions = context?.permissions || {}
  const permissionCodes = Array.isArray(permissions.permissions) ? permissions.permissions : []
  const entitlements = permissions.entitlements || {}
  // Runtime authorization comes from RBAC permission codes. Identity tags are
  // descriptive/bootstrap context only and do not grant UI actions.
  const canManage = permissionCodes.includes('settings.manage')
  const canViewUsers = permissionCodes.includes('user.view')
  const canCreateUsers = permissionCodes.includes('user.create')
  const canEditUsers = permissionCodes.includes('user.edit')
  const canManageUserStoreAssignments = permissionCodes.includes('user.store_assignment.manage')
  const canManageRoles = permissionCodes.includes('role.manage')

  const access = settingSectionAccess({
    permissions: permissionCodes,
  })

  const normalizedQuery = query.trim().toLowerCase()
  const itemMatchesSearch = (item) => {
    if (!normalizedQuery) return true
    const searchable = [item.label, ...(item.searchTerms || [])]
      .join(' ')
      .toLowerCase()
    return searchable.includes(normalizedQuery)
  }

  const metadataGroups = buildSettingsGroupsFromCatalog(settingsCatalog)
  const navigationGroups = metadataGroups
    .map((group) => group.filter((item) => item.key !== 'general'))
    .filter((group) => group.length)

  const visibleGroups = navigationGroups
    .map((group) =>
      group.filter(
        (item) =>
          sectionIsVisible(access, item.label) &&
          itemMatchesSearch(item),
      ),
    )
    .filter((group) => group.length)

  const visibleItems = visibleGroups.flat()
  const current = visibleItems.find((item) => item.key === active) || visibleItems[0] || null
  const platformOnlySection = DEVELOPER_SETTINGS_KEYS.has(current?.key)
  /*
   * Server/API configuration is device/platform configuration, not tenant
   * company settings. Access is granted by oneengine.manage.
   */
  const companyIndependentSection = platformOnlySection
    || (current?.key === 'server-api' && (permissionCodes.includes('oneengine.manage')))
  const hasCompanyContext = context?.hasCompanyContext === true
  const companySettingsError = context?.settingsError || ''

  useEffect(() => {
    if (settingsVisibleLogged.current || loading || !current) return
    if (!companyIndependentSection && (!hasCompanyContext || !settings)) return
    settingsVisibleLogged.current = true
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    console.info('[onePOS] Settings visible', {
      ms: Math.round(now - settingsOpenStartedAt.current),
      source: settingsStartedWithCache.current ? 'session-cache' : 'network-first-load',
      section: current.key,
    })
  }, [loading, current?.key, companyIndependentSection, hasCompanyContext, settings])

  useEffect(() => {
    if (current && current.key !== active) {
      setActive(current.key)
      setRoute('settings', current.key)
    }
  }, [current?.key, active])

  useEffect(() => {
    if (current?.key !== 'users') return
    if (!canViewUsers) {
      setUsers([])
      setUsersError('You do not have permission to view users.')
      return
    }

    let alive = true
    setUsersLoading(true)
    setUsersError('')
    Promise.all([
      loadUsers(),
      apiRequest('/api/settings/jarves').catch(() => null),
    ])
      .then(([rows, jarves]) => {
        if (!alive) return
        setUsers(rows)
        if (jarves?.success) setJarvesState(jarves.data || null)
      })
      .catch((err) => {
        if (alive) setUsersError(err?.message || 'Unable to load users')
      })
      .finally(() => {
        if (alive) setUsersLoading(false)
      })

    return () => {
      alive = false
    }
  }, [current?.key, canViewUsers])

  useEffect(() => {
    if (current?.key !== 'roles-permissions') return
    if (!canManageRoles) {
      setRoles([])
      setRolesError('You do not have permission to manage roles.')
      return
    }

    let alive = true
    setRolesLoading(true)
    setRolesError('')
    Promise.all([loadRoles(), loadPermissions()])
      .then(([roleRows, permissions]) => {
        if (!alive) return
        setRoles(roleRows)
        setPermissionCatalog(permissions)
      })
      .catch((err) => {
        if (alive) setRolesError(err?.message || 'Unable to load roles')
      })
      .finally(() => {
        if (alive) setRolesLoading(false)
      })

    return () => {
      alive = false
    }
  }, [current?.key, canManageRoles])

  const refreshUsers = async () => {
    if (!canViewUsers) return
    setUsers(await loadUsers())
  }

  const toggleUserActive = async (row) => {
    if (!canEditUsers) return
    const nextActive = !row.active
    setUsers((currentRows) =>
      currentRows.map((item) => item.id === row.id ? { ...item, active: nextActive } : item),
    )
    try {
      const response = await apiRequest(`/api/platform/objects/employee/records/${encodeURIComponent(row.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: { active: nextActive } }),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to update user status')
    } catch (err) {
      setUsers((currentRows) =>
        currentRows.map((item) => item.id === row.id ? { ...item, active: row.active } : item),
      )
      setUsersError(err?.message || 'Unable to update user status')
    }
  }

  const toggleUserJarves = async (row) => {
    if (!canEditUsers || !jarvesState) return
    try {
      const response = await apiRequest(`/api/admin/users/${encodeURIComponent(row.id)}/jarves`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !row.jarves_enabled }),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to update JARVES for this user')
      setJarvesState(response.data?.licenceState || jarvesState)
      await refreshUsers()
    } catch (err) {
      setUsersError(err?.message || 'Unable to update JARVES for this user')
    }
  }

  const refreshRoles = async () => {
    if (!canManageRoles) return
    setRoles(await loadRoles())
  }

  const openCreateUser = () => {
    setUserEditor({ mode: 'create', record: null })
  }

  const openEditUser = (row) => {
    setUserEditor({ mode: 'edit', record: row })
  }

  const openCreateRole = () => {
    setRecordForm({ name: '', description: '', parentRoleId: '', permissions: [] })
    setRecordDialog({ type: 'role', mode: 'create' })
  }

  const openEditRole = async (row) => {
    setRecordDialog({ type: 'role', mode: 'edit', loading: true })
    try {
      const selected = await loadRolePermissions(row.id)
      setRecordForm({
        id: row.id,
        name: row.name || '',
        description: row.description || '',
        parentRoleId: row.parent_role_id || '',
        permissions: selected,
        isSystemRole: row.is_system_role === true,
      })
      setRecordDialog({ type: 'role', mode: 'edit' })
    } catch (err) {
      setRolesError(err?.message || 'Unable to load role permissions')
      setRecordDialog(null)
    }
  }

  const saveRecord = async (event) => {
    event.preventDefault()
    if (!recordDialog) return
    setRecordSaving(true)
    try {
      {
        let roleId = recordForm.id
        if (recordDialog.mode === 'create') {
          const created = await createRole({
            name: recordForm.name,
            description: recordForm.description || null,
            parentRoleId: recordForm.parentRoleId || null,
          })
          roleId = created?.data?.id
        } else {
          await updateRole(roleId, {
            name: recordForm.name,
            description: recordForm.description || null,
            parentRoleId: recordForm.parentRoleId || null,
          })
        }
        if (roleId) await saveRolePermissions(roleId, recordForm.permissions || [])
        await refreshRoles()
      }
      setRecordDialog(null)
    } catch (err) {
      setError(err?.message || 'Unable to save record')
    } finally {
      setRecordSaving(false)
    }
  }

  const applyLocalSettingsPatch = (baseContext, patch) => {
    if (!baseContext?.settings) return baseContext
    const nextSettings = { ...baseContext.settings }
    const cloneSection = (key) => { nextSettings[key] = { ...(nextSettings[key] || {}) }; return nextSettings[key] }

    for (const [field, value] of Object.entries(patch || {})) {
      if (field === 'dateFormat') cloneSection('general').dateFormat = value
      else if (field === 'vatEnabled') cloneSection('tax').vatEnabled = value
      else if (field === 'defaultVatRate') cloneSection('tax').defaultVatRate = Number(value)
      else if (field === 'loyaltyEnabled') cloneSection('loyalty').enabled = value
      else if (field === 'loyaltyEarningRate') cloneSection('loyalty').earningRate = value == null ? null : Number(value)
      else if (field === 'loyaltyMinSaleTotal') cloneSection('loyalty').minSaleTotal = value == null ? null : Number(value)
      else if (field === 'loyaltyRedeemValuePerPoint') cloneSection('loyalty').redeemValuePerPoint = value == null ? null : Number(value)
      else if (field === 'loyaltyMinPointsRedeem') cloneSection('loyalty').minPointsRedeem = value == null ? null : Number(value)
      else if (field === 'allowNegativeInventoryBilling') cloneSection('inventory').allowNegativeInventoryBilling = value
      else if (field === 'scanGoEnabled') cloneSection('scanGo').enabled = value
      else if (field === 'exchangeMode') cloneSection('exchange').mode = value
      else if (field === 'batchInventoryMode') cloneSection('inventory').batchInventoryMode = value
      else if (field === 'batchDefaultMfgRule') cloneSection('inventory').batchDefaultMfgRule = value
      else if (field === 'batchDefaultExpiryRule') cloneSection('inventory').batchDefaultExpiryRule = value
      else if (field === 'batchDefaultExpiryDays') cloneSection('inventory').batchDefaultExpiryDays = Number(value)
      else if (field === 'productView') cloneSection('till').productView = value
      else if (field === 'dockQuickAccess') cloneSection('dock').quickAccess = Array.isArray(value) ? [...value] : []
      else if (field === 'customerDisplayEnabled') cloneSection('customerDisplay').enabled = value
      else if (field === 'onlineOrderingEnabled') cloneSection('onlineOrdering').enabled = value
      else if (field === 'onlinePaymentMethods') cloneSection('onlineOrdering').paymentMethods = Array.isArray(value) ? [...value] : []
      else if (field === 'tillInvoicePrefix') cloneSection('invoicePrefixes').till = value
      else if (field === 'deliveryInvoicePrefix') cloneSection('invoicePrefixes').delivery = value
      else if (field === 'selfCheckoutInvoicePrefix') cloneSection('invoicePrefixes').selfCheckout = value
    }

    return { ...baseContext, settings: nextSettings }
  }
  const update = async (field, value) => {
    if (!canManage) return
    const previousContext = context
    try {
      setSaving(field)
      setError('')
      setContext((current) => applyLocalSettingsPatch(current, { [field]: value }))
      await patchSettings({ [field]: value })
    } catch (err) {
      setContext(previousContext)
      setError(err?.message || 'Unable to save setting')
    } finally {
      setSaving('')
    }
  }

  const updateCompany = async (field, value) => {
    if (!canManage) return
    const next = String(value ?? '').trim()
    if (next === String(settings?.company?.[field] ?? '').trim()) return
    const previousContext = context
    try {
      setSaving(`company.${field}`)
      setError('')
      setContext((current) => current?.settings
        ? {
            ...current,
            settings: {
              ...current.settings,
              company: { ...(current.settings.company || {}), [field]: next || null },
            },
          }
        : current)
      const response = await patchCompanySettings({ [field]: next || null })
      if (response?.data) {
        setContext((current) => current?.settings
          ? {
              ...current,
              settings: {
                ...current.settings,
                company: { ...(current.settings.company || {}), ...response.data },
              },
            }
          : current)
      }
    } catch (err) {
      setContext(previousContext)
      setError(err?.message || 'Unable to save company setting')
    } finally {
      setSaving('')
    }
  }

  const updateBatchPolicy = async (changes) => {
    if (!canManage) return
    const inventory = settings?.inventory || {}
    const next = {
      batchInventoryMode: inventory.batchInventoryMode || 'none',
      batchDefaultMfgRule: inventory.batchDefaultMfgRule || 'none',
      batchDefaultExpiryRule: inventory.batchDefaultExpiryRule || 'none',
      batchDefaultExpiryDays: Number(inventory.batchDefaultExpiryDays ?? 365),
      ...changes,
    }
    if (next.batchInventoryMode === 'none') {
      next.batchDefaultMfgRule = 'none'
      next.batchDefaultExpiryRule = 'none'
    }
    const previousContext = context
    try {
      setSaving('batchPolicy')
      setError('')
      setContext((current) => applyLocalSettingsPatch(current, next))
      await patchSettings(next)
    } catch (err) {
      setContext(previousContext)
      setError(err?.message || 'Unable to save batch inventory policy')
    } finally {
      setSaving('')
    }
  }

  const profileName = user?.name || user?.username || 'User'
  const profileRole = user?.role || 'User'
  const initial = profileName.trim().charAt(0).toUpperCase() || 'U'

  return (
    <section className={`settings-page ${mobileSettingsDetail ? 'is-mobile-detail' : 'is-mobile-list'}`}>
      <aside className="settings-sidebar">
        <div className="settings-window-title">Settings</div>

        <label className="settings-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
          />
        </label>

        <button type="button" className="settings-profile" onClick={onOpenProfile} aria-label="Open my profile">
          <div className="settings-avatar">{initial}</div>
          <div>
            <strong>{profileName}</strong>
            <span>{profileRole}</span>
          </div>
        </button>

        <div className="settings-nav">
          {!settingsCatalogLoaded && !metadataGroups.length ? <div className="settings-catalog-state">Loading Settings…</div> : null}
          {settingsCatalogLoaded && !metadataGroups.length ? <div className="settings-catalog-state settings-catalog-state--error">{settingsCatalogError || 'Settings catalogue is unavailable.'}</div> : null}
          {visibleGroups.map((group, groupIndex) => {
            const isDeveloperGroup = group.some((item) => item.developer === true || DEVELOPER_SETTINGS_KEYS.has(item.key))
            return (
            <div className={`settings-group ${isDeveloperGroup ? 'settings-group--developer' : ''}`} key={groupIndex}>
              {isDeveloperGroup ? <div className="settings-developer-divider"><span>Developer</span></div> : null}
              {group.map(({ key, label, icon: Icon, tone }) => (
                <button
                  key={key}
                  type="button"
                  className={`settings-nav-item ${current?.key === key ? 'is-active' : ''}`}
                  onClick={() => { setActive(key); setRoute('settings', key); setMobileSettingsDetail(true) }}
                >
                  <span className={`settings-nav-icon settings-nav-icon--${tone}`}>
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span>{label}</span>
                  <ChevronRight size={14} className="settings-chevron" />
                </button>
              ))}
            </div>
            )
          })}
        </div>
      </aside>

      <div className="settings-content">
        <div className="settings-content-header">
          <button
            type="button"
            className="settings-mobile-back"
            onClick={() => {
              setMobileSettingsDetail(false)
              setRoute('settings', null)
            }}
            aria-label="Back to Settings"
          >
            <ChevronLeft size={17} />
            <span>Settings</span>
          </button>
          <h2>{current?.label ?? 'Settings'}</h2>
        </div>

        <div className="settings-content-body">
          {error ? <div className="settings-error">{error}</div> : null}
          <LazyLoadBoundary>
          <Suspense fallback={<div className="settings-card settings-state-card">Loading section…</div>}>
          {loading ? (
            <div className="settings-card settings-state-card">Loading settings…</div>
          ) : !companyIndependentSection && !hasCompanyContext ? (
            <div className="settings-card settings-state-card">
              Company mapping is unavailable for this user. Sign out and sign in again after an administrator maps the user to a company.
            </div>
          ) : !companyIndependentSection && !settings ? (
            <div className="settings-card settings-state-card">{companySettingsError || 'No settings data available.'}</div>
          ) : (
            <div className={`settings-card ${current?.key === 'company' ? 'settings-card--company-grid' : ''}`}>
              {current?.key === 'general' ? (
                <>
                  <div className="settings-row">
                    <div>
                      <strong>Date format</strong>
                      <p>Regional display format used across onePOS.</p>
                    </div>
                    <select
                      value={settings.general?.dateFormat || 'DD/MM/YYYY'}
                      disabled={!canManage || saving === 'dateFormat'}
                      onChange={(event) => update('dateFormat', event.target.value)}
                    >
                      <option>DD/MM/YYYY</option>
                      <option>MM/DD/YYYY</option>
                      <option>YYYY-MM-DD</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div><strong>Currency</strong><p>Default company currency.</p></div>
                    <input
                      defaultValue={settings.company?.currency || ''}
                      disabled={!canManage || saving === 'company.currency'}
                      onBlur={(event) => updateCompany('currency', event.target.value)}
                      aria-label="Currency"
                    />
                  </div>
                  <div className="settings-row">
                    <div><strong>Timezone</strong><p>Default company timezone.</p></div>
                    <input
                      defaultValue={settings.company?.timezone || ''}
                      disabled={!canManage || saving === 'company.timezone'}
                      onBlur={(event) => updateCompany('timezone', event.target.value)}
                      aria-label="Timezone"
                    />
                  </div>
                  <div className="settings-row">
                    <div><strong>Scan &amp; Go</strong><p>Allow the Scan &amp; Go customer flow for this company.</p></div>
                    <button
                      type="button"
                      className={`mac-switch ${settings.scanGo?.enabled ? 'is-on' : ''}`}
                      disabled={!canManage || saving === 'scanGoEnabled'}
                      onClick={() => update('scanGoEnabled', !settings.scanGo?.enabled)}
                      aria-label="Scan & Go"
                    >
                      <span />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div><strong>Exchange mode</strong><p>Controls which exchange workflow cashiers may use.</p></div>
                    <select
                      value={settings.exchange?.mode || 'both'}
                      disabled={!canManage || saving === 'exchangeMode'}
                      onChange={(event) => update('exchangeMode', event.target.value)}
                    >
                      <option value="receipt">Receipt / Invoice only</option>
                      <option value="normal">Normal / No receipt only</option>
                      <option value="both">Both — cashier chooses</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div><strong>Batch inventory mode</strong><p>Controls whether batch and date data is required when stock enters the company.</p></div>
                    <select
                      value={settings.inventory?.batchInventoryMode || 'none'}
                      disabled={!canManage || saving === 'batchPolicy'}
                      onChange={(event) => updateBatchPolicy({ batchInventoryMode: event.target.value })}
                    >
                      <option value="none">No Batch Inventory</option>
                      <option value="optional_dates">Batch Inventory — Dates Optional</option>
                      <option value="required_dates">Proper Batch Inventory</option>
                    </select>
                  </div>
                  {(settings.inventory?.batchInventoryMode || 'none') === 'optional_dates' ? (
                    <>
                      <div className="settings-row">
                        <div><strong>Manufacturing date default</strong><p>Applied when a manufacturing date is not entered.</p></div>
                        <select
                          value={settings.inventory?.batchDefaultMfgRule || 'none'}
                          disabled={!canManage || saving === 'batchPolicy'}
                          onChange={(event) => updateBatchPolicy({ batchDefaultMfgRule: event.target.value })}
                        >
                          <option value="none">No default</option>
                          <option value="today">Today</option>
                        </select>
                      </div>
                      <div className="settings-row">
                        <div><strong>Expiry date default</strong><p>Applied when an expiry date is not entered.</p></div>
                        <select
                          value={settings.inventory?.batchDefaultExpiryRule || 'none'}
                          disabled={!canManage || saving === 'batchPolicy'}
                          onChange={(event) => updateBatchPolicy({ batchDefaultExpiryRule: event.target.value })}
                        >
                          <option value="none">No default</option>
                          <option value="today_plus_days">Today + days</option>
                        </select>
                      </div>
                      <div className="settings-row">
                        <div><strong>Default expiry days</strong><p>Number of days added when the expiry default uses Today + days.</p></div>
                        <input
                          type="number"
                          min="0"
                          max="3650"
                          value={Number(settings.inventory?.batchDefaultExpiryDays ?? 365)}
                          disabled={!canManage || saving === 'batchPolicy'}
                          onChange={(event) => updateBatchPolicy({ batchDefaultExpiryDays: Number(event.target.value) })}
                          aria-label="Default expiry days"
                        />
                      </div>
                    </>
                  ) : null}
                </>
              ) : current?.key === 'company' ? (
                <div className="settings-company-grid">
                  <section className="settings-subcard settings-company-main-card">
                    <div className="settings-subcard-title">
                      <div><strong>Company</strong><span>Identity, contact and company-level information.</span></div>
                    </div>
                    {[
                      ['name', 'Company name', 'Company identity used across onePOS.'],
                      ['legalName', 'Legal / business name', 'Legal trading name shown on business documents.'],
                      ['email', 'Company email', 'Main company contact email.'],
                      ['phone', 'Company phone', 'Main company contact number.'],
                    ].map(([field, label, help]) => (
                      <div className="settings-row" key={field}>
                        <div><strong>{label}</strong><p>{help}</p></div>
                        <input
                          defaultValue={settings.company?.[field] || ''}
                          disabled={!canManage || saving === `company.${field}`}
                          onBlur={(event) => updateCompany(field, event.target.value)}
                          aria-label={label}
                        />
                      </div>
                    ))}
                    <div className="settings-row">
                      <div><strong>Company logo</strong><p>Used in company branding and supported business documents.</p></div>
                      <div className="settings-inline-actions">
                        {settings.company?.logoUrl ? (
                          <img
                            src={settings.company.logoUrl}
                            alt="Company logo"
                            style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8 }}
                          />
                        ) : <span className="settings-value">Not configured</span>}
                        <label className="settings-file-button">
                          <span>Choose file</span>
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            disabled={!canManage || saving === 'company.logoUrl'}
                            onChange={async (event) => {
                              const file = event.target.files?.[0]
                              if (!file) return
                              try {
                                const dataUrl = await compressCompanyLogo(file)
                                await updateCompany('logoUrl', dataUrl)
                              } catch (err) {
                                setError(err?.message || 'Unable to prepare company logo')
                              } finally {
                                event.target.value = ''
                              }
                            }}
                          />
                        </label>
                        {settings.company?.logoUrl ? (
                          <button
                            type="button"
                            className="settings-secondary-button"
                            disabled={!canManage || saving === 'company.logoUrl'}
                            onClick={() => updateCompany('logoUrl', '')}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="settings-row">
                      <div>
                        <strong>Licence</strong>
                        <p>Read-only entitlement information for this company.</p>
                      </div>
                      <span className="settings-value">
                        {Object.entries(entitlements).filter(([, enabled]) => enabled === true).length
                          ? `${Object.entries(entitlements).filter(([, enabled]) => enabled === true).length} modules enabled`
                          : 'Base licence active'}
                      </span>
                    </div>
                  </section>

                  <section className="settings-subcard settings-company-general-card">
                    <div className="settings-subcard-title">
                      <div><strong>General</strong><span>Regional and operational defaults.</span></div>
                    </div>
                    <div className="settings-row">
                      <div><strong>Date format</strong><p>Regional display format used across onePOS.</p></div>
                      <select
                        value={settings.general?.dateFormat || 'DD/MM/YYYY'}
                        disabled={!canManage || saving === 'dateFormat'}
                        onChange={(event) => update('dateFormat', event.target.value)}
                      >
                        <option>DD/MM/YYYY</option>
                        <option>MM/DD/YYYY</option>
                        <option>YYYY-MM-DD</option>
                      </select>
                    </div>
                    <div className="settings-row">
                      <div><strong>Currency</strong><p>Default company currency.</p></div>
                      <input
                        defaultValue={settings.company?.currency || ''}
                        disabled={!canManage || saving === 'company.currency'}
                        onBlur={(event) => updateCompany('currency', event.target.value)}
                        aria-label="Currency"
                      />
                    </div>
                    <div className="settings-row">
                      <div><strong>Timezone</strong><p>Default company timezone.</p></div>
                      <input
                        defaultValue={settings.company?.timezone || ''}
                        disabled={!canManage || saving === 'company.timezone'}
                        onBlur={(event) => updateCompany('timezone', event.target.value)}
                        aria-label="Timezone"
                      />
                    </div>
                    <div className="settings-row">
                      <div><strong>Scan &amp; Go</strong><p>Allow the Scan &amp; Go customer flow.</p></div>
                      <button
                        type="button"
                        className={`mac-switch ${settings.scanGo?.enabled ? 'is-on' : ''}`}
                        disabled={!canManage || saving === 'scanGoEnabled'}
                        onClick={() => update('scanGoEnabled', !settings.scanGo?.enabled)}
                        aria-label="Scan & Go"
                      >
                        <span />
                      </button>
                    </div>
                    <div className="settings-row">
                      <div><strong>Exchange mode</strong><p>Controls which exchange workflow cashiers may use.</p></div>
                      <select
                        value={settings.exchange?.mode || 'both'}
                        disabled={!canManage || saving === 'exchangeMode'}
                        onChange={(event) => update('exchangeMode', event.target.value)}
                      >
                        <option value="receipt">Receipt / Invoice only</option>
                        <option value="normal">Normal / No receipt only</option>
                        <option value="both">Both — cashier chooses</option>
                      </select>
                    </div>
                    <div className="settings-row">
                      <div><strong>Batch inventory mode</strong><p>Controls batch and date requirements.</p></div>
                      <select
                        value={settings.inventory?.batchInventoryMode || 'none'}
                        disabled={!canManage || saving === 'batchPolicy'}
                        onChange={(event) => updateBatchPolicy({ batchInventoryMode: event.target.value })}
                      >
                        <option value="none">No Batch Inventory</option>
                        <option value="optional_dates">Batch Inventory — Dates Optional</option>
                        <option value="required_dates">Proper Batch Inventory</option>
                      </select>
                    </div>
                    {(settings.inventory?.batchInventoryMode || 'none') === 'optional_dates' ? (
                      <>
                        <div className="settings-row">
                          <div><strong>Manufacturing date default</strong><p>Used when a manufacturing date is not entered.</p></div>
                          <select
                            value={settings.inventory?.batchDefaultMfgRule || 'none'}
                            disabled={!canManage || saving === 'batchPolicy'}
                            onChange={(event) => updateBatchPolicy({ batchDefaultMfgRule: event.target.value })}
                          >
                            <option value="none">No default</option>
                            <option value="today">Today</option>
                          </select>
                        </div>
                        <div className="settings-row">
                          <div><strong>Expiry date default</strong><p>Used when an expiry date is not entered.</p></div>
                          <select
                            value={settings.inventory?.batchDefaultExpiryRule || 'none'}
                            disabled={!canManage || saving === 'batchPolicy'}
                            onChange={(event) => updateBatchPolicy({ batchDefaultExpiryRule: event.target.value })}
                          >
                            <option value="none">No default</option>
                            <option value="today_plus_days">Today + days</option>
                          </select>
                        </div>
                        <div className="settings-row">
                          <div><strong>Default expiry days</strong><p>Days added when Today + days is selected.</p></div>
                          <input
                            type="number"
                            min="0"
                            max="3650"
                            value={Number(settings.inventory?.batchDefaultExpiryDays ?? 365)}
                            disabled={!canManage || saving === 'batchPolicy'}
                            onChange={(event) => updateBatchPolicy({ batchDefaultExpiryDays: Number(event.target.value) })}
                            aria-label="Default expiry days"
                          />
                        </div>
                      </>
                    ) : null}
                  </section>
                </div>
              ) : current?.key === 'store-till' ? (
                <StoreTillSettingsPage settings={settings} onSettingsChanged={load} />
              ) : current?.key === 'client-web-shop' ? (
                <ClientWebShopSettings />
              ) : current?.key === 'tax-vat' ? (
                <>
                  <div className="settings-row">
                    <strong>VAT enabled</strong>
                    <button
                      type="button"
                      className={`mac-switch ${settings.tax?.vatEnabled ? 'is-on' : ''}`}
                      disabled={!canManage || saving === 'vatEnabled'}
                      onClick={() => update('vatEnabled', !settings.tax?.vatEnabled)}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div><strong>Default VAT rate</strong><p>Any rate from 0% to 100%.</p></div>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={Number(settings.tax?.defaultVatRate ?? 20)}
                      disabled={!canManage || saving === 'defaultVatRate'}
                      onBlur={(event) => {
                        const next = Number(event.target.value)
                        if (Number.isFinite(next) && next >= 0 && next <= 100 && next !== Number(settings.tax?.defaultVatRate ?? 20)) {
                          update('defaultVatRate', next)
                        }
                      }}
                      aria-label="Default VAT rate"
                    />
                  </div>
                </>
              ) : current?.key === 'receipts' ? (
                <>
                  <div className="settings-row">
                    <div><strong>Header company</strong><p>Company name used on receipts.</p></div>
                    <span className="settings-value">{settings.company?.name || '—'}</span>
                  </div>
                  <div className="settings-row">
                    <div><strong>VAT display</strong><p>Uses the company VAT configuration.</p></div>
                    <button
                      type="button"
                      className={`mac-switch ${settings.tax?.vatEnabled ? 'is-on' : ''}`}
                      disabled={!canManage || saving === 'vatEnabled'}
                      onClick={() => update('vatEnabled', !settings.tax?.vatEnabled)}
                      aria-label="VAT display"
                    >
                      <span />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div><strong>Default VAT rate</strong><p>Rate shown when VAT is enabled.</p></div>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={Number(settings.tax?.defaultVatRate ?? 20)}
                      disabled={!canManage || saving === 'defaultVatRate'}
                      onBlur={(event) => {
                        const next = Number(event.target.value)
                        if (Number.isFinite(next) && next >= 0 && next <= 100 && next !== Number(settings.tax?.defaultVatRate ?? 20)) {
                          update('defaultVatRate', next)
                        }
                      }}
                      aria-label="Receipt VAT rate"
                    />
                  </div>
                  <div className="settings-row">
                    <div><strong>Date format</strong><p>Date format printed on receipts.</p></div>
                    <select
                      value={settings.general?.dateFormat || 'DD/MM/YYYY'}
                      disabled={!canManage || saving === 'dateFormat'}
                      onChange={(event) => update('dateFormat', event.target.value)}
                    >
                      <option>DD/MM/YYYY</option>
                      <option>MM/DD/YYYY</option>
                      <option>YYYY-MM-DD</option>
                    </select>
                  </div>
                  <div className="settings-row">
                    <div><strong>Paper width</strong><p>Printer and paper settings are managed under Hardware.</p></div>
                    <span className="settings-value">Configure under Hardware</span>
                  </div>
                </>
              ) : current?.key === 'payment-terminals' ? (
                <PaymentTerminalSettings />
              ) : current?.key === 'customer-loyalty' ? (
                <>
                  <div className="settings-row">
                    <strong>Loyalty enabled</strong>
                    <button
                      type="button"
                      className={`mac-switch ${settings.loyalty?.enabled ? 'is-on' : ''}`}
                      disabled={!canManage || saving === 'loyaltyEnabled'}
                      onClick={() => update('loyaltyEnabled', !settings.loyalty?.enabled)}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="settings-row">
                    <div><strong>Earning rate</strong><p>Percentage of purchase total earned as points (1% = 1 point per £1).</p></div>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      defaultValue={(Number(settings.loyalty?.earningRate || 0) * 100).toFixed(2)}
                      disabled={!canManage || saving === 'loyaltyEarningRate'}
                      onBlur={(event) => {
                        const percent = Number(event.target.value)
                        if (Number.isFinite(percent) && percent >= 0 && percent <= 100) {
                          const next = percent / 100
                          if (next !== Number(settings.loyalty?.earningRate || 0)) update('loyaltyEarningRate', next)
                        }
                      }}
                      aria-label="Loyalty earning rate"
                    />
                  </div>
                </>
              ) : current?.key === 'hardware' ? (
                <HardwareSettings />
              ) : current?.key === 'connections' ? (
                <ConnectionsSettings />
              ) : current?.key === 'email-delivery' ? (
                <DeliverySettingsPage channel="email" />
              ) : current?.key === 'sms-delivery' ? (
                <DeliverySettingsPage channel="sms" />
              ) : current?.key === 'whatsapp-assistant' ? (
                <WhatsAppAssistantSettings />
              ) : current?.key === 'ai-assistant' ? (
                <AiAssistantSettings />
              ) : current?.key === 'security-identity' ? (
                <SecurityIdentitySettings />
              ) : current?.key === 'mfa-administration' ? (
                <MfaAdministrationSettings />
              ) : current?.key === 'identity-verification-history' ? (
                <IdentityAssuranceSettings mode="history" />
              ) : current?.key === 'security-governance' ? (
                <SecurityGovernanceSettings />
              ) : current?.key === 'data-protection' ? (
                <DataProtectionSettings />
              ) : current?.key === 'users' ? (
                <RecordListView
                  title="Users"
                  subtitle={`${users.length} user${users.length === 1 ? '' : 's'} in this company`}
                  rows={users}
                  loading={usersLoading}
                  error={usersError}
                  canCreate={canCreateUsers}
                  canEdit={canEditUsers}
                  onCreate={openCreateUser}
                  onEdit={openEditUser}
                  objectKey="employee"
                  objectLabel="Users"
                  onDataChanged={refreshUsers}
                  searchKeys={['full_name', 'username', 'email', 'role_name', 'store_name']}
                  columns={[
                    { key: 'full_name', label: 'Name', render: (row) => row.full_name || '—' },
                    { key: 'username', label: 'Username' },
                    { key: 'email', label: 'Email', render: (row) => row.email || '—' },
                    { key: 'role_name', label: 'Role', render: (row) => row.role_name || '—' },
                    { key: 'store_name', label: 'Primary Store', render: (row) => row.store_name || 'Unassigned' },
                    {
                      key: 'store_access',
                      label: 'Store Access',
                      sortValue: () => '',
                      render: (row) => canManageUserStoreAssignments ? (
                        <button
                          type="button"
                          className="user-store-access-button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setUserStoreEditor(row)
                          }}
                        >
                          Manage
                        </button>
                      ) : '—',
                    },
                    {
                      key: 'jarves_enabled',
                      label: 'JARVES',
                      sortValue: (row) => row.jarves_enabled ? 'Enabled' : 'Disabled',
                      render: (row) => jarvesState && canEditUsers ? (
                        <button
                          type="button"
                          className={`record-status-toggle ${row.jarves_enabled ? 'is-on' : ''}`}
                          aria-pressed={row.jarves_enabled === true}
                          aria-label={`${row.jarves_enabled ? 'Disable' : 'Enable'} JARVES for ${row.full_name || row.username}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void toggleUserJarves(row)
                          }}
                        >
                          <span className="record-status-toggle-track"><span /></span>
                          <b>{row.jarves_enabled ? 'Enabled' : 'Disabled'}</b>
                        </button>
                      ) : (row.jarves_enabled ? 'Enabled' : '—'),
                    },
                    {
                      key: 'active',
                      label: 'Status',
                      sortValue: (row) => row.active ? 'Active' : 'Inactive',
                      render: (row) => (
                        <button
                          type="button"
                          className={`record-status-toggle ${row.active ? 'is-on' : ''}`}
                          aria-pressed={row.active}
                          aria-label={`${row.active ? 'Deactivate' : 'Activate'} ${row.full_name || row.username}`}
                          disabled={!canEditUsers}
                          onClick={(event) => {
                            event.stopPropagation()
                            void toggleUserActive(row)
                          }}
                        >
                          <span className="record-status-toggle-track"><span /></span>
                          <b>{row.active ? 'Active' : 'Inactive'}</b>
                        </button>
                      ),
                    },
                  ]}
                />
              ) : current?.key === 'roles-permissions' ? (
                <RecordListView
                  title="Roles & Permissions"
                  subtitle={rolesLoading ? 'Loading roles…' : `${roles.length} role${roles.length === 1 ? '' : 's'} in this company`}
                  rows={roles}
                  loading={rolesLoading}
                  error={rolesError}
                  canCreate={canManageRoles}
                  canEdit={canManageRoles}
                  onCreate={openCreateRole}
                  onEdit={openEditRole}
                  searchKeys={['name', 'description', 'parent_role_name']}
                  columns={[
                    { key: 'name', label: 'Name' },
                    { key: 'description', label: 'Description', render: (row) => row.description || '—' },
                    { key: 'parent_role_name', label: 'Parent role', render: (row) => row.parent_role_name || '—' },
                    { key: 'user_count', label: 'Users' },
                    { key: 'is_system_role', label: 'Type', render: (row) => row.is_system_role ? 'System' : 'Custom' },
                  ]}
                />
              ) : (
                <div className="settings-row">
                  <div>
                    <strong>{current?.label}</strong>
                    <p>RBAC visibility is live. This section is ready for the next onePOS component/data migration pass.</p>
                  </div>
                  <ChevronRight size={16} />
                </div>
              )}
            </div>
          )}
          </Suspense>
          </LazyLoadBoundary>

        </div>
      </div>

      {userStoreEditor ? (
        <UserStoreAccessModal
          user={userStoreEditor}
          currentUserId={user?.id}
          canEdit={canManageUserStoreAssignments}
          onClose={() => setUserStoreEditor(null)}
          onSaved={refreshUsers}
        />
      ) : null}

      {userEditor ? (
        <MetadataRecordFormModal
          objectKey="employee"
          record={userEditor.record}
          mode={userEditor.mode}
          title={userEditor.mode === 'create' ? 'Add User' : 'Edit User'}
          onClose={() => setUserEditor(null)}
          onSaved={async () => {
            setUserEditor(null)
            await refreshUsers()
          }}
        />
      ) : null}

      {recordDialog ? (
        <div className="record-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !recordSaving) setRecordDialog(null)
        }}>
          <form className="record-dialog" onSubmit={saveRecord}>
            <div className="record-dialog-header">
              <div>
                <strong>
                  {recordDialog.mode === 'create' ? 'Create Role' : 'Edit Role'}
                </strong>
                <span>Role and permission record</span>
              </div>
              <button type="button" className="record-dialog-close" onClick={() => setRecordDialog(null)}>×</button>
            </div>

            {recordDialog.loading ? (
              <div className="record-dialog-loading">Loading…</div>
            ) : (
              <div className="record-dialog-body">
                <label>Role name<input value={recordForm.name || ''} onChange={(e) => setRecordForm({ ...recordForm, name: e.target.value })} required disabled={recordForm.isSystemRole === true} /></label>
                <label>Description<textarea rows="3" value={recordForm.description || ''} onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })} /></label>
                <label>Parent role
                  <select value={recordForm.parentRoleId || ''} onChange={(e) => setRecordForm({ ...recordForm, parentRoleId: e.target.value })}>
                    <option value="">No parent</option>
                    {roles.filter((role) => role.id !== recordForm.id).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
                <div className="record-permissions">
                  <strong>Permissions</strong>
                  <div className="record-permissions-grid">
                    {permissionCatalog.map((permission) => {
                      const checked = (recordForm.permissions || []).includes(permission.code)
                      return (
                        <label key={permission.code} className="record-permission-item">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const currentPermissions = new Set(recordForm.permissions || [])
                              if (e.target.checked) currentPermissions.add(permission.code)
                              else currentPermissions.delete(permission.code)
                              setRecordForm({ ...recordForm, permissions: Array.from(currentPermissions) })
                            }}
                          />
                          <span><b>{permission.name || permission.code}</b><small>{permission.code}</small></span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {!recordDialog.loading ? (
              <div className="record-dialog-footer">
                <button type="button" className="record-dialog-secondary" onClick={() => setRecordDialog(null)} disabled={recordSaving}>Cancel</button>
                <button type="submit" className="record-dialog-primary" disabled={recordSaving}>{recordSaving ? 'Saving…' : 'Save'}</button>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
    </section>
  )
}


function TopbarAppsMenu({ apps, query, onClose, onOpenRoute, onOpenStore, onRetry, loading = false, error = '', mode = 'launcher' }) {
  const q = String(query || '').trim().toLowerCase()
  const visible = apps.filter((item) => item?.visible !== false && item?.system_only !== true)
    .filter((item) => !q || marketplaceSearchText(item).includes(q))
  const installed = visible.filter((item) => Boolean(item.company_installation))
  const available = visible.filter((item) => !item.company_installation)
  const showInstalled = mode !== 'store'
  const renderRows = (rows, start = 0) => rows.slice(0, 12).map((item, index) => {
    const icon = appIconUrl(item)
    return (
      <motion.button
        key={item.package_key || item.id}
        type="button"
        className="topbar-app-row"
        onClick={() => {
          const route = resolveAppOpenRoute(item)
          if (mode !== 'store' && item?.company_installation) {
            onOpenRoute?.(route)
            onClose?.()
            return
          }
          if (mode !== 'store' && !item?.company_installation) {
            onOpenStore?.(item.package_key)
            return
          }
          onClose?.()
        }}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', mass: 0.12, stiffness: 260, damping: 21, delay: Math.min(0.18, (start + index) * 0.018) }}
        whileHover={{ y: -2, scale: 1.018 }}
        whileTap={{ scale: 0.97 }}
      >
        <span className="topbar-app-icon">
          {icon ? <img src={icon} alt="" draggable="false" onError={applyDefaultAppIcon} /> : <ShoppingBag size={20} />}
        </span>
        <span><strong>{item.name || item.package_key}</strong><small>{item.category || 'App'}</small></span>
      </motion.button>
    )
  })
  return (
    <motion.div
      className="mac-popover topbar-app-menu"
      initial={{ opacity: 0, y: -16, scale: 0.86, transformOrigin: 'top right' }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.9 }}
      transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}
    >
      <div className="mac-popover-title">{mode === 'store' ? 'oneStore' : 'Launcher'}</div>
      {loading && !apps.length ? <div className="module-state compact">Loading apps…</div> : null}
      {error ? <div className="onestore-message is-error"><CircleAlert size={13}/><span>{error}</span><button type="button" onClick={onRetry}>Retry</button></div> : null}
      <div className="topbar-app-sections">
        {showInstalled ? <section><b>Installed</b><div className="topbar-app-grid">{installed.length ? renderRows(installed, 0) : <p>No installed apps match.</p>}</div></section> : null}
        <section><b>Available in oneStore</b><div className="topbar-app-grid">{available.length ? renderRows(available, showInstalled ? installed.length : 0) : <p>No available apps match.</p>}</div></section>
      </div>
    </motion.div>
  )
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
            const installed = Boolean(item.company_installation)
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
                  if (installed && route) {
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
    ['Till guide', 'Sales, payments, returns and till workflows'],
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
  const topbarPanelRef = useRef(null)
  const storedUser = getStoredUser()
  const isTillUser = String(storedUser?.defaultLandingPage || '').toLowerCase() === 'till'

  useEffect(() => {
    if (!isTillUser || activeApp !== 'home') return
    const next = { app: 'till', section: null }
    setRouteState(next)
    setRoute('till')
    setActiveApp('till')
  }, [isTillUser, activeApp])

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
    loadSessionPermissions({ includeEntitlements: false })
      .then((permissions) => {
        if (live) setDesktopPermissions(Array.isArray(permissions?.permissions) ? permissions.permissions : [])
      })
      .catch(() => { if (live && !getStoredSessionPermissions()) setDesktopPermissions([]) })
    return () => { live = false }
  }, [])

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
      contacts: 'customers',
      one_connect_google: 'google-connect',
      one_assistant: 'assistant',
      one_kiosk: 'kiosk',
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

    const routeMap = new Set([
      'integrations','google-connect','accounting','online-orders','order-prep','own-delivery',
      'assistant','kiosk','kiosk-display','kiosk-devices','returns','exchange','layaway','supplier-returns','audit-log','licensing',
      'app-releases','dashboard','reports','custom-reports','stores','employees','customers',
      'gift-cards','suppliers','purchases','inventory','replenishment','categories',
      'global-products','products','sales','workspace','till',
    ])

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
    if (routeMap.has(target)) {
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
    <main className="screen desktop-screen">
      <div className="wallpaper wallpaper--desktop" />

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
                if (label === 'Till guide') openItem('till')
                else if (label === 'Settings guide' || label === 'Getting started') { setRoute('settings', 'company'); setRouteState({ app: 'settings', section: 'company' }); setActiveApp('settings') }
                else { setRoute('settings', 'connections'); setRouteState({ app: 'settings', section: 'connections' }); setActiveApp('settings') }
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
          canManageOneEngine ? (
            <OneDeveloperPage
              initialSection={routeState?.section || 'objects'}
              onSectionChange={(section) => {
                const next = { app: 'developer', section }
                setRouteState(next)
                setRoute('developer', section)
              }}
            />
          ) : <div className="module-state">OneEngine Manager permission required.</div>
        ) : activeApp === 'settings' ? (
          <SettingsPage onOpenProfile={() => {
            const next = { app: 'profile', section: null }
            setRouteState(next)
            setRoute('profile')
            setActiveApp('profile')
          }} />
        ) : activeApp === 'google-connect' ? (
          <GoogleConnectSettings />
        ) : activeApp === 'connector-settings' ? (
          <ConnectorAppSettings packageKey={routeState?.packageKey || ''} onBack={() => { setTopPanel('store'); setActiveApp('home'); setRoute('home') }} />
        ) : activeApp === 'till' ? (
          <TillPage
            onOpenSettings={() => { setRoute('settings', 'store-till'); setActiveApp('settings') }}
            onNavigate={openItem}
          />
        ) : activeApp === 'sales' ? (
          <SalesPage
            onOpenReturns={() => openItem('returns')}
            onOpenSupplierReturns={() => openItem('supplier-returns')}
          />
        ) : activeApp === 'returns' ? (
          <ReturnsPage />
        ) : activeApp === 'exchange' ? (
          <ExchangePage />
        ) : activeApp === 'layaway' ? (
          <LayawayPage />
        ) : activeApp === 'supplier-returns' ? (
          <SupplierReturnsPage />
        ) : activeApp === 'products' ? (
          <ProductsPage
            onOpenCategories={() => openItem('categories')}
            onOpenGlobalProducts={() => openItem('global-products')}
          />
        ) : activeApp === 'categories' ? (
          <CategoriesPage onBack={() => openItem('products')} />
        ) : activeApp === 'global-products' ? (
          <GlobalProductLookupPage
            onBack={() => openItem('products')}
            onOpenStore={() => {
              setAppSearch('')
              setTopPanel('store')
            }}
          />
        ) : activeApp === 'inventory' ? (
          <InventoryPage onOpenReplenishment={() => openItem('replenishment')} />
        ) : activeApp === 'replenishment' ? (
          <ReplenishmentPage onBack={() => openItem('inventory')} />
        ) : activeApp === 'purchases' ? (
          <PurchasesPage />
        ) : activeApp === 'suppliers' ? (
          <SuppliersPage />
        ) : activeApp === 'customers' ? (
          <CustomersPage onOpenGiftCards={() => openItem('gift-cards')} />
        ) : activeApp === 'gift-cards' ? (
          <GiftCardsPage onBack={() => openItem('customers')} />
        ) : activeApp === 'employees' ? (
          <AttendancePage />
        ) : activeApp === 'stores' ? (
          <StoresPage />
        ) : activeApp === 'reports' ? (
          <ReportsPage onOpenCustomReports={() => openItem('custom-reports')} />
        ) : activeApp === 'custom-reports' ? (
          <CustomReportsPage onBack={() => openItem('reports')} />
        ) : activeApp === 'integrations' ? (
          <IntegrationsAdmin storeId={routeState?.storeId || activeStoreId || storedUser?.storeId || null} />
        ) : activeApp === 'accounting' ? (
          <AccountingAdmin storeId={routeState?.storeId || activeStoreId || storedUser?.storeId || null} />
        ) : activeApp === 'online-orders' ? (
          <OnlineOrdersAdmin />
        ) : activeApp === 'order-prep' ? (
          <OnlineOrdersPrep />
        ) : activeApp === 'own-delivery' ? (
          <OwnDeliveryWorkspace />
        ) : activeApp === 'assistant' ? (
          <OneAssistantPage />
        ) : activeApp === 'kiosk' ? (
          <OneKioskPage />
        ) : activeApp === 'kiosk-display' ? (
          <OneKioskDisplayPage />
        ) : activeApp === 'kiosk-devices' ? (
          <OneKioskDevicesPage />
        ) : activeApp === 'audit-log' ? (
          <AuditLogPage />
        ) : activeApp === 'licensing' ? (
          canManageOneEngine ? <div className="superadmin-theme"><LicensingAdmin /></div> : <div className="module-state">OneEngine Manager permission required.</div>
        ) : activeApp === 'app-releases' ? (
          canManageOneEngine ? <div className="superadmin-theme"><AppReleasesAdmin /></div> : <div className="module-state">OneEngine Manager permission required.</div>
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
        ) : (
          <DashboardPage />
        )}
      </Suspense>
      </LazyLoadBoundary>

      <Dock onItemOpen={openItem} collapsible={activeApp === 'till'} />
    </main>
  )
}

export default function App() {
  const route = readRoute()
  if (route.app === 'customer-display') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading display…</div>}><CustomerDisplay /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'flow-runtime') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading flow…</div>}><ScreenFlowRuntimePage sessionId={route.sessionId} /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'public-assistant-booking') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading booking…</div>}><PublicAppointmentBookingPage token={route.token} /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'kiosk-runtime') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading kiosk…</div>}><OneKioskPage publicMode /></Suspense></LazyLoadBoundary>
  }
  if (route.app === 'kiosk-display') {
    return <LazyLoadBoundary><Suspense fallback={<div className="route-loading" role="status">Loading collection display…</div>}><OneKioskDisplayPage /></Suspense></LazyLoadBoundary>
  }

  // A browser refresh should restore an authenticated session, not behave like
  // an explicit workstation lock. PIN is only required after the user chooses
  // Lock during the current session.
  const [locked, setLocked] = useState(() => !hasSession())
  const [sessionContextReady, setSessionContextReady] = useState(() => !hasSession())
  const [pendingUnlock, setPendingUnlock] = useState(false)

  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    // Existing sessions (browser refresh / OAuth callback) need one bootstrap
    // before Desktop renders. Fresh password login already receives the resolved
    // company context from /api/auth/login, so do not repeat those requests.
    if (!hasSession()) {
      setSessionContextReady(true)
      return
    }
    let live = true
    setSessionContextReady(false)
    const bootstrapTimeout = window.setTimeout(() => {
      // Never leave the workstation trapped behind the company-context loader.
      // API calls have their own timeout, but this is a final UI recovery guard.
      if (live) setSessionContextReady(true)
    }, 15000)
    ensureActingCompanyContext()
      .catch(() => '')
      .finally(() => {
        window.clearTimeout(bootstrapTimeout)
        if (live) setSessionContextReady(true)
      })
    return () => {
      live = false
      window.clearTimeout(bootstrapTimeout)
    }
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
