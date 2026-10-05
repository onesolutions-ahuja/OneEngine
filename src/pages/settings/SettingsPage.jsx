import { Suspense, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Bell, Settings2, Shield, Image, Users, Printer, ChevronLeft, ChevronRight,
  Building2, Store, ShoppingCart, ReceiptText, CreditCard, HardDrive, ShieldCheck,
  Sparkles, Cable, MonitorCog, LayoutGrid, Mail,
} from 'lucide-react'
import { apiRequest, getStoredUser } from '../../services/api'
import { DEVELOPER_SETTINGS_KEYS, readRoute, setRoute } from '../../navigation/routes'
import { LazyLoadBoundary, lazyWithRecovery } from '../../navigation/lazyRuntime.jsx'
import {
  createRole, loadPermissions, loadRolePermissions, loadRoles, loadSettingsCatalog,
  loadSettingsContext, loadUsers, patchCompanySettings, patchSettings,
  readSettingsContextCache, saveRolePermissions, updateRole,
} from '../../services/settings'
import { settingSectionAccess, sectionIsVisible } from '../../utils/settingsAccess'

const RecordListView = lazyWithRecovery(() => import('../../components/RecordListView'))
const MetadataRecordFormModal = lazyWithRecovery(() => import('../../components/MetadataRecordFormModal'))
const UserStoreAccessModal = lazyWithRecovery(() => import('../../components/UserStoreAccessModal'))
const ClientWebShopSettings = lazyWithRecovery(() => import('./ClientWebShopSettings'))
const PaymentTerminalSettings = lazyWithRecovery(() => import('./PaymentTerminalSettings'))
const HardwareSettings = lazyWithRecovery(() => import('./HardwareSettings'))
const AiAssistantSettings = lazyWithRecovery(() => import('./AiAssistantSettings'))
const ConnectionsSettings = lazyWithRecovery(() => import('./ConnectionsSettings'))
const StoreTillSettingsPage = lazyWithRecovery(() => import('./StoreTillSettingsPage'))
const DeliverySettingsPage = lazyWithRecovery(() => import('./DeliverySettingsPage'))
const WhatsAppAssistantSettings = lazyWithRecovery(() => import('./WhatsAppAssistantSettings'))
const SecurityIdentitySettings = lazyWithRecovery(() => import('./SecurityIdentitySettings'))
const MfaAdministrationSettings = lazyWithRecovery(() => import('./MfaAdministrationSettings'))
const SecurityGovernanceSettings = lazyWithRecovery(() => import('./SecurityGovernanceSettings'))
const DataProtectionSettings = lazyWithRecovery(() => import('./DataProtectionSettings'))
const IdentityAssuranceSettings = lazyWithRecovery(() => import('./IdentityAssuranceSettings'))

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

export default function SettingsPage({ onOpenProfile }) {
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


