import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { apiRequest, apiUrl, checkBackend, getStoredUser, hasSession, login, logout, verifyPin } from './services/api'
import { createRole, createUser, loadPermissions, loadRolePermissions, loadRoles, loadSettingsCatalog, loadSettingsContext, loadUsers, patchSettings, saveRolePermissions, updateRole, updateUser } from './services/settings'
import { settingSectionAccess, sectionIsVisible } from './utils/settingsAccess'
import JarvisOrb from './components/jarvis/JarvisOrb'
import RecordListView from './components/RecordListView'
import OneBuilder from './pages/settings/OneBuilder'
import MetadataSettingsPage from './pages/settings/MetadataSettingsPage'
import ObjectsSettingsPane from './pages/settings/ObjectsSettingsPane'
import TillPage from './pages/till/TillPage'
import WorkspacePage from './pages/workspace/WorkspacePage'
import {
  Bluetooth,
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Wifi,
  Bell,
  Volume2,
  Moon,
  Clock3,
  Settings2,
  CircleUserRound,
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
  ChevronRight,
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
} from 'lucide-react'

const dockItems = [
  { id: 'launchpad', label: 'Launcher', src: 'https://rdvnui.com/assets/Launchpad-wwI6e3wv.png', scaled: true },
  { id: 'store', label: 'oneStore', src: localAppIcon('onestore'), scaled: true },
  { id: 'builder', label: 'Builder', icon: LayoutGrid },
  { id: 'contacts', label: 'Contacts', icon: Users },
  { id: 'till', label: 'Till', icon: MonitorSmartphone },
  { id: 'settings', label: 'Settings', src: 'https://rdvnui.com/assets/Settings-BIHCu_gi.png', scaled: true },
]

function useClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  return now
}

function Dock({ onItemOpen }) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const resetMagnification = () => mouseX.set(Number.POSITIVE_INFINITY)
  const trackTouch = (event) => {
    const touch = event.touches?.[0]
    if (touch) mouseX.set(touch.clientX)
  }

  return (
    <div className="dock-zone">
      <motion.div
        className="dock"
        onMouseMove={(event) => mouseX.set(event.clientX)}
        onMouseLeave={resetMagnification}
        aria-label="Smart Theme dock"
      >
        <div
          className="dock-magnify-zone"
          onTouchStart={trackTouch}
          onTouchMove={trackTouch}
          onTouchEnd={resetMagnification}
          onTouchCancel={resetMagnification}
        >
          {dockItems.map((item) => (
            <DockItem
              key={item.id}
              item={item}
              mouseX={mouseX}
              onActivate={() => onItemOpen?.(item.id)}
            />
          ))}
        </div>
        <div className="dock-fixed-zone">
          <div className="dock-separator" aria-hidden="true" />
          <div className="dock-jarves-slot">
            <JarvisOrb onClick={() => onItemOpen?.('jarves')} />
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function DockItem({ item, mouseX, onActivate }) {
  const ref = useRef(null)

  const distance = useTransform(mouseX, (value) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return value - bounds.x - bounds.width / 2
  })

  const widthTarget = useTransform(distance, [-150, 0, 150], [40, 100, 40])
  const width = useSpring(widthTarget, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  })

  return (
    <motion.button
      ref={ref}
      type="button"
      className="dock-item"
      style={{ width }}
      onClick={onActivate}
      aria-label={item.label}
    >
      <span className="dock-icon-wrap">
        {item.icon ? (
          <item.icon className="dock-lucide-icon" size={27} strokeWidth={1.8} />
        ) : (
          <img
            className={item.scaled ? 'dock-image dock-image--scaled' : 'dock-image'}
            src={item.src}
            alt=""
            draggable="false"
          />
        )}
      </span>
    </motion.button>
  )
}

function LockScreen({ onUnlock, onSignOut }) {
  const now = useClock()
  const sessionMode = hasSession()
  const storedUser = getStoredUser()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const time = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now),
    [now],
  )

  const date = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(now),
    [now],
  )

  const submit = async (event) => {
    event?.preventDefault()
    try {
      setSubmitting(true)
      setError('')

      if (sessionMode) {
        if (!pin.trim()) return
        await verifyPin(pin.trim())
        onUnlock()
        return
      }

      if (!username.trim() || !password) return
      await login(username.trim(), password)
      onUnlock()
    } catch (err) {
      setError(err?.message || 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  const displayName = storedUser?.name || storedUser?.username || 'User'
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U'

  return (
    <main className="screen lock-screen">
      <div className="wallpaper wallpaper--lock" />
      <div className="lock-vignette" />

      <section className="lock-content" aria-label="Login screen">
        <div className="lock-date">{date}</div>
        <div className="lock-time">{time}</div>

        <form className="login-glass-card" onSubmit={submit}>
          <div className="profile-avatar login-avatar">{initial}</div>

          {sessionMode ? (
            <>
              <div className="login-title">{displayName}</div>
              <div className="login-subtitle">Enter PIN to unlock</div>

              <input
                className="login-field login-pin-field"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="PIN"
                inputMode="numeric"
                type="password"
                autoComplete="off"
                autoFocus
              />

              {error ? <div className="login-error">{error}</div> : null}

              <button
                className="login-submit"
                type="submit"
                disabled={submitting || !pin.trim()}
              >
                {submitting ? 'Unlocking…' : 'Unlock'}
              </button>

              <button
                className="lock-signout"
                type="button"
                onClick={onSignOut}
                disabled={submitting}
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              <div className="login-title">One Solutions</div>
              <div className="login-subtitle">Sign in with your account</div>

              <input
                className="login-field"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Email or username"
                autoComplete="username"
                autoFocus
              />

              <input
                className="login-field"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                autoComplete="current-password"
              />

              {error ? <div className="login-error">{error}</div> : null}

              <button
                className="login-submit"
                type="submit"
                disabled={submitting || !username.trim() || !password}
              >
                {submitting ? 'Signing in…' : 'Sign In'}
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  )
}

const settingsFallbackGroups = [
  [
    { key: 'general', label: 'General', icon: Settings2, tone: 'orange', searchTerms: ['date format', 'currency', 'timezone', 'regional'] },
    { key: 'company', label: 'Company', icon: Building2, tone: 'blue', searchTerms: ['company name', 'legal name', 'company email', 'company phone', 'logo'] },
    { key: 'store-till', label: 'Store & Till', icon: Store, tone: 'blue', searchTerms: ['store', 'till', 'terminal', 'terminal number', 'product view', 'invoice'] },
    { key: 'client-web-shop', label: 'Client Web Shop', icon: ShoppingCart, tone: 'green' },
  ],
  [
    { key: 'tax-vat', label: 'Tax / VAT', icon: ReceiptText, tone: 'green', searchTerms: ['vat', 'tax', 'vat enabled', 'default vat rate', 'rate'] },
    { key: 'receipts', label: 'Receipts', icon: ReceiptText, tone: 'green' },
    { key: 'payment-terminals', label: 'Payment Terminals', icon: CreditCard, tone: 'green' },
    { key: 'customer-loyalty', label: 'Customer Loyalty', icon: Sparkles, tone: 'purple', searchTerms: ['loyalty', 'earning rate', 'points', 'redeem', 'rewards'] },
  ],
  [
    { key: 'hardware', label: 'Hardware', icon: HardDrive, tone: 'gray' },
  ],
  [
    { key: 'users', label: 'Users', icon: Users, tone: 'blue', searchTerms: ['user', 'username', 'email', 'role', 'store', 'active', 'inactive'] },
    { key: 'roles-permissions', label: 'Roles & Permissions', icon: ShieldCheck, tone: 'blue', searchTerms: ['role', 'permission', 'permissions', 'parent role', 'system role', 'custom role'] },
  ],
  [
    { key: 'ai-assistant', label: 'AI assistant', icon: Sparkles, tone: 'purple' },
  ],
  [
    { key: 'connections', label: 'Connections', icon: Cable, tone: 'purple' },
    { key: 'uber-eats', label: 'Uber Eats', icon: Cable, tone: 'purple' },
    { key: 'deliveroo', label: 'Deliveroo', icon: Cable, tone: 'purple' },
    { key: 'whatsapp', label: 'WhatsApp', icon: Cable, tone: 'green' },
  ],
  [
    { key: 'sms-delivery', label: 'SMS Delivery', icon: CreditCard, tone: 'pink' },
    { key: 'email-delivery', label: 'Email Delivery', icon: Mail, tone: 'pink' },
  ],
  [
    { key: 'server-api', label: 'Server Configuration', icon: MonitorCog, tone: 'gray' },
  ],
  [
    { key: 'objects', label: 'Objects', icon: LayoutGrid, tone: 'cyan', searchTerms: ['objects', 'object manager', 'fields', 'metadata', 'api name'] },
    { key: 'platform', label: 'Platform', icon: LayoutGrid, tone: 'cyan', searchTerms: ['onebuilder', 'workflow', 'approval flow', 'dashboard builder', 'report builder', 'canvas', 'components'] },
    { key: 'message-templates', label: 'Message Templates', icon: ReceiptText, tone: 'cyan' },
  ],
]

const SETTINGS_NAV_CACHE_KEY = 'onepos.settings.nav.v1'

function settingsNavSlug(value) {
  return String(value || 'settings').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function readSettingsNavCache() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SETTINGS_NAV_CACHE_KEY) || 'null')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function writeSettingsNavCache(value) {
  try { sessionStorage.setItem(SETTINGS_NAV_CACHE_KEY, JSON.stringify(Array.isArray(value) ? value : [])) } catch {}
}

const settingsFallbackEntries = settingsFallbackGroups.flat()

function settingsVisual(label, explicitKey = '') {
  const labelSlug = settingsNavSlug(label)
  const match = settingsFallbackEntries.find((entry) =>
    entry.key === explicitKey || settingsNavSlug(entry.label) === labelSlug
  )
  return {
    key: explicitKey || match?.key || labelSlug,
    icon: match?.icon || Settings2,
    tone: match?.tone || 'gray',
    searchTerms: match?.searchTerms || [],
  }
}

function buildSettingsGroupsFromCatalog(catalog) {
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
        push(
          fieldConfig.settingsGroup || fieldConfig.settings_group || config.settingsGroup || config.settings_group || 'Settings',
          { ...visual, label },
        )
      }
      continue
    }

    const label = config.settingsLabel || config.settings_label || object?.label || object?.name || object?.object_key || object?.api_name
    if (!label) continue
    const explicitKey = config.settingsRouteKey || config.settings_route_key || config.settingsKey || config.settings_key || ''
    const visual = settingsVisual(label, explicitKey)
    push(config.settingsGroup || config.settings_group || 'Settings', { ...visual, label })
  }

  return [...grouped.values()].filter((group) => group.length)
}

const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

function readRoute() {
  const base = APP_BASE || ''
  const path = window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean)
  if (parts[0] === 'settings') return { app: 'settings', section: parts[1] || 'general' }
  if (parts[0] === 'till') return { app: 'till', section: null }
  if (parts[0] === 'workspace') return { app: 'workspace', section: null }
  return { app: 'home', section: null }
}

function setRoute(app, section = null) {
  const base = APP_BASE || ''
  const next = app === 'settings'
    ? `${base}/settings${section && section !== 'general' ? `/${section}` : ''}`
    : app === 'till'
      ? `${base}/till`
      : app === 'workspace'
        ? `${base}/workspace`
        : `${base}/`
  if (window.location.pathname !== next) window.history.pushState(null, '', next)
}

function SettingsPage() {
  const [active, setActive] = useState(() => readRoute().section || 'general')
  const [query, setQuery] = useState('')
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')
  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [roles, setRoles] = useState([])
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState('')
  const [permissionCatalog, setPermissionCatalog] = useState([])
  const [recordDialog, setRecordDialog] = useState(null)
  const [recordForm, setRecordForm] = useState({})
  const [recordSaving, setRecordSaving] = useState(false)
  const [settingsCatalog, setSettingsCatalog] = useState(() => readSettingsNavCache())

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      setContext(await loadSettingsContext())
    } catch (err) {
      setError(err?.message || 'Unable to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    let live = true
    loadSettingsCatalog()
      .then((rows) => {
        if (!live || !rows.length) return
        writeSettingsNavCache(rows)
        setSettingsCatalog(rows)
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const permissions = context?.permissions || {}
  const permissionCodes = Array.isArray(permissions.permissions) ? permissions.permissions : []
  const isSuperadmin = permissions.isSuperadmin === true
  const isAdmin = permissions.isAdmin === true
  const isPlatformDeveloper = context?.user?.isPlatformDeveloper === true
  const entitlements = permissions.entitlements || {}
  // Runtime authorization comes from RBAC permission codes. Identity tags are
  // descriptive/bootstrap context only and do not grant UI actions.
  const canManage = permissionCodes.includes('settings.manage')
  const canViewUsers = permissionCodes.includes('user.view')
  const canCreateUsers = permissionCodes.includes('user.create')
  const canEditUsers = permissionCodes.includes('user.edit')
  const canManageRoles = permissionCodes.includes('role.manage')

  const access = settingSectionAccess({
    isAdmin,
    isSuperadmin,
    isPlatformDeveloper,
    loyalty: entitlements.loyalty === true,
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
  const navigationGroups = metadataGroups.length ? metadataGroups : settingsFallbackGroups

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
  const platformOnlySection = current?.key === 'objects' || current?.key === 'platform'
  /*
   * Server/API configuration is device/platform configuration, not tenant
   * company settings. A Platform Superadmin legitimately has no company_id,
   * so do not force an acting-company context for this section. Visibility is
   * still controlled by settingSectionAccess(), where Server Configuration is
   * Superadmin-only.
   */
  const companyIndependentSection = platformOnlySection || (current?.key === 'server-api' && isSuperadmin)
  const hasCompanyContext = context?.hasCompanyContext === true
  const companySettingsError = context?.settingsError || ''


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
    loadUsers()
      .then((rows) => {
        if (alive) setUsers(rows)
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
      await updateUser(row.id, {
        fullName: row.full_name,
        email: row.email || null,
        roleId: row.role_id || null,
        storeId: row.store_id || null,
        active: nextActive,
      })
    } catch (err) {
      setUsers((currentRows) =>
        currentRows.map((item) => item.id === row.id ? { ...item, active: row.active } : item),
      )
      setUsersError(err?.message || 'Unable to update user status')
    }
  }

  const refreshRoles = async () => {
    if (!canManageRoles) return
    setRoles(await loadRoles())
  }

  const openCreateUser = () => {
    setRecordForm({ username: '', fullName: '', email: '', password: '', roleId: '', storeId: null, active: true })
    setRecordDialog({ type: 'user', mode: 'create' })
  }

  const openEditUser = (row) => {
    setRecordForm({
      id: row.id,
      username: row.username || '',
      fullName: row.full_name || '',
      email: row.email || '',
      password: '',
      roleId: row.role_id || '',
      storeId: row.store_id || null,
      active: row.active !== false,
    })
    setRecordDialog({ type: 'user', mode: 'edit' })
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
      if (recordDialog.type === 'user') {
        if (recordDialog.mode === 'create') {
          await createUser({
            username: recordForm.username,
            fullName: recordForm.fullName,
            email: recordForm.email || null,
            password: recordForm.password,
            roleId: recordForm.roleId || null,
            storeId: recordForm.storeId || null,
          })
        } else {
          await updateUser(recordForm.id, {
            fullName: recordForm.fullName,
            email: recordForm.email || null,
            roleId: recordForm.roleId || null,
            storeId: recordForm.storeId || null,
            active: recordForm.active !== false,
            ...(recordForm.password ? { password: recordForm.password } : {}),
          })
        }
        await refreshUsers()
      } else {
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

  const settings = context?.settings
  const user = context?.user
  const update = async (field, value) => {
    if (!canManage) return
    try {
      setSaving(field)
      setError('')
      await patchSettings({ [field]: value })
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save setting')
    } finally {
      setSaving('')
    }
  }

  const profileName = user?.name || user?.username || 'User'
  const profileRole = isSuperadmin ? 'Superadmin' : user?.role || 'User'
  const initial = profileName.trim().charAt(0).toUpperCase() || 'U'

  return (
    <section className="settings-page">
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

        <div className="settings-profile">
          <div className="settings-avatar">{initial}</div>
          <div>
            <strong>{profileName}</strong>
            <span>{profileRole}</span>
          </div>
        </div>

        <div className="settings-nav">
          {visibleGroups.map((group, groupIndex) => (
            <div className="settings-group" key={groupIndex}>
              {group.map(({ key, label, icon: Icon, tone }) => (
                <button
                  key={key}
                  type="button"
                  className={`settings-nav-item ${current?.key === key ? 'is-active' : ''}`}
                  onClick={() => { setActive(key); setRoute('settings', key) }}
                >
                  <span className={`settings-nav-icon settings-nav-icon--${tone}`}>
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span>{label}</span>
                  <ChevronRight size={14} className="settings-chevron" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <div className="settings-content">
        <div className="settings-content-header">
          <h2>{current?.label ?? 'Settings'}</h2>
        </div>

        <div className="settings-content-body">
          {error ? <div className="settings-error">{error}</div> : null}
          {loading ? (
            <div className="settings-card settings-state-card">Loading settings…</div>
          ) : !companyIndependentSection && !hasCompanyContext ? (
            <div className="settings-card settings-state-card">Select a company context to manage company settings.</div>
          ) : !companyIndependentSection && !settings ? (
            <div className="settings-card settings-state-card">{companySettingsError || 'No settings data available.'}</div>
          ) : (
            <div className="settings-card">
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
                    <span className="settings-value">{settings.company?.currency || '—'}</span>
                  </div>
                  <div className="settings-row">
                    <div><strong>Timezone</strong><p>Default company timezone.</p></div>
                    <span className="settings-value">{settings.company?.timezone || '—'}</span>
                  </div>
                </>
              ) : current?.key === 'company' ? (
                <>
                  <div className="settings-row"><strong>Company name</strong><span className="settings-value">{settings.company?.name || '—'}</span></div>
                  <div className="settings-row"><strong>Legal name</strong><span className="settings-value">{settings.company?.legalName || '—'}</span></div>
                  <div className="settings-row"><strong>Company email</strong><span className="settings-value">{settings.company?.email || '—'}</span></div>
                  <div className="settings-row"><strong>Company phone</strong><span className="settings-value">{settings.company?.phone || '—'}</span></div>
                </>
              ) : current?.key === 'store-till' ? (
                <>
                  <div className="settings-row"><strong>Store</strong><span className="settings-value">{settings.store?.name || settings.store?.storeName || 'Current store'}</span></div>
                  <div className="settings-row"><strong>Till</strong><span className="settings-value">{settings.till?.name || '—'}</span></div>
                  <div className="settings-row"><strong>Terminal number</strong><span className="settings-value">{settings.till?.terminalNumber || '—'}</span></div>
                  <div className="settings-row"><strong>Product view</strong><span className="settings-value">{settings.till?.productView || 'image'}</span></div>
                </>
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
                    <strong>Default VAT rate</strong>
                    <select
                      value={String(settings.tax?.defaultVatRate ?? 20)}
                      disabled={!canManage || saving === 'defaultVatRate'}
                      onChange={(event) => update('defaultVatRate', Number(event.target.value))}
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="20">20%</option>
                    </select>
                  </div>
                </>
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
                  <div className="settings-row"><strong>Earning rate</strong><span className="settings-value">{Number(settings.loyalty?.earningRate || 0) * 100}%</span></div>
                </>
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
                    { key: 'store_name', label: 'Store', render: (row) => row.store_name || 'All stores' },
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
                          onClick={() => toggleUserActive(row)}
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
                  subtitle={`${roles.length} role${roles.length === 1 ? '' : 's'} in this company`}
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
              ) : current?.key === 'objects' ? (
                <ObjectsSettingsPane />
              ) : current?.key === 'platform' ? (
                <OneBuilder />
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

          {!loading && !companyIndependentSection && hasCompanyContext && (
            <div className="settings-rbac-note">
              {canManage ? 'Editing allowed by settings.manage.' : 'Read-only: your role does not have settings.manage.'}
            </div>
          )}
        </div>
      </div>

      {recordDialog ? (
        <div className="record-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !recordSaving) setRecordDialog(null)
        }}>
          <form className="record-dialog" onSubmit={saveRecord}>
            <div className="record-dialog-header">
              <div>
                <strong>
                  {recordDialog.type === 'user'
                    ? (recordDialog.mode === 'create' ? 'Create User' : 'Edit User')
                    : (recordDialog.mode === 'create' ? 'Create Role' : 'Edit Role')}
                </strong>
                <span>{recordDialog.type === 'role' ? 'Role and permission record' : 'User account record'}</span>
              </div>
              <button type="button" className="record-dialog-close" onClick={() => setRecordDialog(null)}>×</button>
            </div>

            {recordDialog.loading ? (
              <div className="record-dialog-loading">Loading…</div>
            ) : recordDialog.type === 'user' ? (
              <div className="record-dialog-body">
                {recordDialog.mode === 'create' ? (
                  <label>Username<input value={recordForm.username || ''} onChange={(e) => setRecordForm({ ...recordForm, username: e.target.value })} required /></label>
                ) : (
                  <label>Username<input value={recordForm.username || ''} disabled /></label>
                )}
                <label>Full name<input value={recordForm.fullName || ''} onChange={(e) => setRecordForm({ ...recordForm, fullName: e.target.value })} required /></label>
                <label>Email<input type="email" value={recordForm.email || ''} onChange={(e) => setRecordForm({ ...recordForm, email: e.target.value })} /></label>
                <label>{recordDialog.mode === 'create' ? 'Password' : 'New password (optional)'}<input type="password" value={recordForm.password || ''} onChange={(e) => setRecordForm({ ...recordForm, password: e.target.value })} required={recordDialog.mode === 'create'} /></label>
                <label>Role
                  <select value={recordForm.roleId || ''} onChange={(e) => setRecordForm({ ...recordForm, roleId: e.target.value })}>
                    <option value="">No role</option>
                    {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                  </select>
                </label>
                {recordDialog.mode === 'edit' ? (
                  <label className="record-dialog-checkbox">
                    <input type="checkbox" checked={recordForm.active !== false} onChange={(e) => setRecordForm({ ...recordForm, active: e.target.checked })} />
                    Active user
                  </label>
                ) : null}
              </div>
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


const MARKETPLACE_ICON_ALIASES = {
  uber_eats: 'uber-eats',
  'uber-eats': 'uber-eats',
  deliveroo: 'deliveroo',
  just_eat: 'just-eat',
  'just-eat': 'just-eat',
  quickbooks_online: 'quickbooks',
  quickbooks: 'quickbooks',
  shopify: 'shopify',
  xero_accounting: 'xero-accounting',
  xero: 'xero',
  sage_business_cloud_accounting: 'sage-business-cloud-accounting',
  sage_accounting: 'sage-business-cloud-accounting',
  sage: 'sage',
  whatsapp_connector: 'whatsapp',
  whatsapp: 'whatsapp',
}

function localAppIcon(assetKey) {
  const clean = String(assetKey || '').trim().toLowerCase().replaceAll('_', '-')
  if (!clean || !/^[a-z0-9-]+$/.test(clean)) return ''
  const base = import.meta.env.BASE_URL || '/'
  return `${base}icons/apps/${clean}.svg`
}

function marketplaceIcon(item) {
  const manifest = item?.manifest || {}
  const provider = manifest.providerConnector || manifest.provider_connector || {}
  const explicit = item?.icon_url || item?.logo_url || item?.icon
    || manifest.iconUrl || manifest.icon_url || manifest.logoUrl || manifest.logo_url || manifest.icon
    || provider.iconUrl || provider.logoUrl

  if (typeof explicit === 'string' && explicit.trim()) {
    const value = explicit.trim()
    if (/^https?:\/\//i.test(value)) return value
    if (value.startsWith('/icons/apps/')) return `${import.meta.env.BASE_URL || '/'}${value.replace(/^\//, '')}`
    return apiUrl(value.startsWith('/') ? value : `/${value}`)
  }

  const keys = [
    item?.icon_asset_key,
    item?.iconAssetKey,
    manifest.iconAssetKey,
    manifest.icon_asset_key,
    provider.providerKey,
    provider.provider_key,
    item?.package_key,
  ].filter(Boolean)

  for (const key of keys) {
    const normalized = String(key).trim().toLowerCase().replace(/[\s-]+/g, '_')
    const alias = MARKETPLACE_ICON_ALIASES[normalized] || String(key).trim().toLowerCase().replaceAll('_', '-')
    if (/^[a-z0-9-]+$/.test(alias)) return localAppIcon(alias)
  }

  return localAppIcon('default-app')
}

function TopbarAppsMenu({ apps, query, onClose, mode = 'launcher' }) {
  const q = String(query || '').trim().toLowerCase()
  const visible = apps.filter((item) => item?.visible !== false && item?.system_only !== true)
    .filter((item) => !q || `${item.name || ''} ${item.package_key || ''} ${item.category || ''}`.toLowerCase().includes(q))
  const installed = visible.filter((item) => Boolean(item.company_installation))
  const available = visible.filter((item) => !item.company_installation)
  const showInstalled = mode !== 'store'
  const renderRows = (rows, start = 0) => rows.slice(0, 12).map((item, index) => {
    const icon = marketplaceIcon(item)
    return (
      <motion.button
        key={item.package_key || item.id}
        type="button"
        className="topbar-app-row"
        onClick={onClose}
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', mass: 0.12, stiffness: 260, damping: 21, delay: Math.min(0.18, (start + index) * 0.018) }}
        whileHover={{ y: -2, scale: 1.018 }}
        whileTap={{ scale: 0.97 }}
      >
        <span className="topbar-app-icon">
          {icon ? <img src={icon} alt="" draggable="false" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = localAppIcon('default-app') }} /> : <ShoppingBag size={20} />}
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
      <div className="topbar-app-sections">
        {showInstalled ? <section><b>Installed</b><div className="topbar-app-grid">{installed.length ? renderRows(installed, 0) : <p>No installed apps match.</p>}</div></section> : null}
        <section><b>Available in oneStore</b><div className="topbar-app-grid">{available.length ? renderRows(available, showInstalled ? installed.length : 0) : <p>No available apps match.</p>}</div></section>
      </div>
    </motion.div>
  )
}

function ConnectionMenu({ health, onRefresh }) {
  const online = health?.status === 'Connected'
  return (
    <motion.div className="mac-popover connection-menu git-macos-panel" initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}>
      <div className="git-macos-card">
        <div className="git-macos-row git-macos-row--top">
          <span className="git-macos-icon git-macos-icon--blue"><Wifi size={16} /></span>
          <div className="git-macos-copy"><strong>Wi-Fi</strong><small>{online ? 'Connected to onePOS network' : 'Wi-Fi is off'}</small></div>
          <span className={`git-macos-switch ${online ? 'is-on' : ''}`}><i /></span>
        </div>
        <div className="git-macos-status"><span className={`git-macos-status-dot ${online ? 'is-online' : ''}`} />{health?.status || 'Unknown'}</div>
      </div>
      <div className="git-macos-card">
        <div className="git-macos-row">
          <span className="git-macos-icon git-macos-icon--gray">DB</span>
          <div className="git-macos-copy"><strong>Network</strong><small>{health?.database || 'Unknown'}</small></div>
        </div>
      </div>
      <button type="button" className="git-macos-footer-button" onClick={onRefresh}><RefreshCw size={13} /> Refresh status</button>
    </motion.div>
  )
}

function DevicesMenu({ onOpenSettings }) {
  return (
    <motion.div className="mac-popover devices-menu git-macos-panel" initial={{ opacity: 0, y: -10, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}>
      <div className="git-macos-card">
        <div className="git-macos-row git-macos-row--top">
          <span className="git-macos-icon git-macos-icon--blue"><Bluetooth size={16} /></span>
          <div className="git-macos-copy"><strong>Bluetooth</strong><small>This device is discoverable while Bluetooth settings are open.</small></div>
          <span className="git-macos-switch"><i /></span>
        </div>
      </div>
      <div className="git-macos-section-title">My Devices</div>
      <div className="git-macos-card">
        <div className="git-macos-row">
          <span className="git-macos-icon git-macos-icon--gray"><Printer size={15} /></span>
          <div className="git-macos-copy"><strong>POS hardware</strong><small>Scanners, printers and accessories</small></div>
          <span className="git-macos-chevron">›</span>
        </div>
      </div>
      <div className="git-macos-section-title git-macos-section-title--nearby">Nearby Devices <span className="git-macos-spinner" /></div>
      <div className="git-macos-card git-macos-card--center">Searching…</div>
      <button type="button" className="git-macos-footer-button" onClick={onOpenSettings}>Open Hardware Settings</button>
    </motion.div>
  )
}

function ControlCenterMenu({ onOpenWifi, onOpenBluetooth }) {
  const [focusOn, setFocusOn] = useState(false)
  const [volume, setVolume] = useState(58)
  return (
    <motion.div
      className="mac-popover control-center-menu git-control-center"
      initial={{ opacity: 0, y: -10, scale: 0.9, transformOrigin: 'top right' }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.94 }}
      transition={{ type: 'spring', mass: 0.1, stiffness: 150, damping: 12 }}
    >
      <div className="git-control-main">
        <motion.button type="button" className="git-control-line" onClick={onOpenWifi} whileTap={{ scale: .98 }}>
          <span className="git-control-circle is-blue"><Wifi size={16}/></span>
          <span><strong>Wi-Fi</strong><small>onePOS network</small></span>
          <ChevronRight size={14} className="git-control-row-chevron"/>
        </motion.button>
        <motion.button type="button" className="git-control-line" onClick={onOpenBluetooth} whileTap={{ scale: .98 }}>
          <span className="git-control-circle is-blue"><Bluetooth size={16}/></span>
          <span><strong>Bluetooth</strong><small>Devices</small></span>
          <ChevronRight size={14} className="git-control-row-chevron"/>
        </motion.button>
        <motion.button type="button" className="git-control-line" onClick={() => setFocusOn((value) => !value)} whileTap={{ scale: .98 }}>
          <span className={`git-control-circle ${focusOn ? 'is-purple' : ''}`}><Moon size={15}/></span>
          <span><strong>Focus</strong><small>{focusOn ? 'On' : 'Off'}</small></span>
          <span className={`git-macos-switch ${focusOn ? 'is-on' : ''}`}><i /></span>
        </motion.button>
      </div>
      <div className="git-control-slider-card">
        <div className="git-control-slider-title"><span>Sound</span><Volume2 size={15}/></div>
        <input
          className="git-control-volume"
          type="range"
          min="0"
          max="100"
          value={volume}
          aria-label="Sound volume"
          onChange={(event) => setVolume(Number(event.target.value))}
        />
      </div>
    </motion.div>
  )
}

function Desktop({ onLock }) {
  const [message, setMessage] = useState('Hello.')
  const [activeApp, setActiveApp] = useState(() => readRoute().app)
  const [topPanel, setTopPanel] = useState('')
  const [appSearch, setAppSearch] = useState('')
  const [storeApps, setStoreApps] = useState([])
  const [connectionHealth, setConnectionHealth] = useState({ status: 'Checking…', database: 'Checking…' })
  const topbarPanelRef = useRef(null)
  const now = useClock()
  const storedUser = getStoredUser()
  const isTillUser = !storedUser?.isSuperadmin && /till|cashier|sales/i.test(String(storedUser?.role || ''))

  useEffect(() => {
    const syncRoute = () => setActiveApp(readRoute().app)
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])

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
    Promise.all([
      apiRequest('/api/packages/marketplace').catch(() => ({ data: [] })),
      checkBackend().catch(() => null),
    ]).then(([packages, health]) => {
      if (!live) return
      setStoreApps(Array.isArray(packages?.data) ? packages.data : [])
      setConnectionHealth({
        status: health ? 'Connected' : 'Offline',
        database: health?.database || (health ? 'Connected' : 'Unavailable'),
      })
    })
    return () => { live = false }
  }, [])

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

  const openItem = (id) => {
    if (id === 'workspace') {
      setRoute('workspace')
      setActiveApp('workspace')
      return
    }
    if (id === 'launchpad') {
      setAppSearch('')
      setTopPanel('apps')
      return
    }
    if (id === 'store') {
      setAppSearch('')
      setTopPanel('store')
      return
    }
    if (id === 'builder') {
      setRoute('settings', 'platform')
      setActiveApp('settings')
      return
    }
    if (id === 'contacts') {
      setRoute('workspace')
      setActiveApp('workspace')
      return
    }
    if (id === 'settings') {
      setRoute('settings', readRoute().section || 'general')
      setActiveApp('settings')
      return
    }
    if (id === 'till') {
      setRoute('till')
      setActiveApp('till')
      return
    }
    if (id === 'jarves') {
      setMessage('JARVES')
      return
    }
    const item = dockItems.find((entry) => entry.id === id) ?? null
    setMessage(`${item?.label ?? 'App'} clicked — component wiring comes next.`)
  }

  return (
    <main className="screen desktop-screen">
      <div className="wallpaper wallpaper--desktop" />

      <header className="demo-menubar">
        <div className="menubar-left">
          <button
            type="button"
            className="brand-chip one-brand"
            onClick={() => { setMessage('Hello.'); setRoute('home'); setActiveApp('home') }}
            aria-label="One Solutions"
          >
            <svg className="one-logo-play" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id="oneLogoGradient" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ff6f61" />
                  <stop offset="24%" stopColor="#ffb347" />
                  <stop offset="48%" stopColor="#e34acb" />
                  <stop offset="72%" stopColor="#7a5cff" />
                  <stop offset="100%" stopColor="#38bdf8" />
                </linearGradient>
              </defs>
              <path d="M7.35 3.15c-2.3 0-4.2 1.88-4.2 4.2v9.3c0 2.32 1.9 4.2 4.2 4.2h9.3c2.32 0 4.2-1.88 4.2-4.2v-9.3c0-2.32-1.88-4.2-4.2-4.2h-9.3Z" fill="url(#oneLogoGradient)" />
              <path d="M9.5 7.9 16.3 12 9.5 16.1V7.9Z" fill="#fff" />
            </svg>
          </button>

          <button type="button" className="menu-text menu-text--strong">Finder</button>
          <button type="button" className="menu-text">File</button>
          <button type="button" className="menu-text">Edit</button>
          <button type="button" className="menu-text">View</button>
          <button type="button" className="menu-text">Go</button>
          <button type="button" className="menu-text">Window</button>
          <button type="button" className="menu-text">Help</button>
        </div>

        <div className="menubar-spacer" />

        <div className="menubar-right" ref={topbarPanelRef}>
          <div className="topbar-search-wrap">
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
                placeholder="Search apps"
                aria-label="Search apps"
              />
            </motion.label>
            <AnimatePresence>
              {topPanel === 'apps' || topPanel === 'store' ? (
                <TopbarAppsMenu apps={storeApps} query={appSearch} mode={topPanel === 'store' ? 'store' : 'launcher'} onClose={() => setTopPanel('')} />
              ) : null}
            </AnimatePresence>
          </div>
          <div className="topbar-status-wrap">
            <button type="button" className={`status-button ${topPanel === 'wifi' ? 'is-active' : ''}`} aria-label="Connection health" aria-expanded={topPanel === 'wifi'} onClick={() => setTopPanel(topPanel === 'wifi' ? '' : 'wifi')}>
              <Wifi size={17} strokeWidth={2.1} />
            </button>
            <AnimatePresence>
              {topPanel === 'wifi' ? <ConnectionMenu health={connectionHealth} onRefresh={async () => {
                const health = await checkBackend().catch(() => null)
                setConnectionHealth({ status: health ? 'Connected' : 'Offline', database: health?.database || (health ? 'Connected' : 'Unavailable') })
              }} /> : null}
            </AnimatePresence>
          </div>
          <div className="topbar-status-wrap">
            <button type="button" className={`status-button ${topPanel === 'bluetooth' ? 'is-active' : ''}`} aria-label="Devices" aria-expanded={topPanel === 'bluetooth'} onClick={() => setTopPanel(topPanel === 'bluetooth' ? '' : 'bluetooth')}>
              <Bluetooth size={17} strokeWidth={2.1} />
            </button>
            <AnimatePresence>
              {topPanel === 'bluetooth' ? <DevicesMenu onOpenSettings={() => { setRoute('settings', 'hardware'); setActiveApp('settings'); setTopPanel('') }} /> : null}
            </AnimatePresence>
          </div>
          <div className="topbar-status-wrap">
            <button type="button" className={`status-button ${topPanel === 'control' ? 'is-active' : ''}`} aria-label="Control Center" aria-expanded={topPanel === 'control'} onClick={() => setTopPanel(topPanel === 'control' ? '' : 'control')}>
              <SlidersHorizontal size={18} strokeWidth={2.2} />
            </button>
            <AnimatePresence>
              {topPanel === 'control' ? <ControlCenterMenu onOpenWifi={() => setTopPanel('wifi')} onOpenBluetooth={() => setTopPanel('bluetooth')} /> : null}
            </AnimatePresence>
          </div>
          <button
            type="button"
            className="status-button"
            aria-label="Open Settings"
            title="Settings"
            onClick={() => { setTopPanel(''); setRoute('settings', 'general'); setActiveApp('settings') }}
          >
            <Settings2 size={17} strokeWidth={2.1} />
          </button>
          <button type="button" className="menubar-time-button">
            {dateTime}
          </button>
        </div>
      </header>

      {activeApp === 'settings' ? (
        <SettingsPage />
      ) : activeApp === 'till' ? (
        <TillPage onOpenSettings={() => { setRoute('settings', 'store-till'); setActiveApp('settings') }} />
      ) : activeApp === 'workspace' ? (
        <WorkspacePage onNavigate={openItem} />
      ) : (
        <section className="hello-stage">
          <p className="eyebrow">SMART THEME</p>
          <h1>{message}</h1>
          <p className="hello-subtitle">
            Clean macOS-inspired UI foundation, built independently for onePOS.
          </p>
        </section>
      )}

      <Dock onItemOpen={openItem} />
    </main>
  )
}

export default function App() {
  // A browser refresh should restore an authenticated session, not behave like
  // an explicit workstation lock. PIN is only required after the user chooses
  // Lock during the current session.
  const [locked, setLocked] = useState(() => !hasSession())

  useEffect(() => {
    checkBackend()
      .then(() => document.documentElement.setAttribute('data-onepos-backend', 'connected'))
      .catch(() => document.documentElement.setAttribute('data-onepos-backend', 'offline'))
  }, [])
  const [transitioning, setTransitioning] = useState(false)

  const unlock = () => {
    if (transitioning) return
    setTransitioning(true)
    window.setTimeout(() => {
      setLocked(false)
      setTransitioning(false)
    }, 320)
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
      {locked ? <LockScreen onUnlock={unlock} onSignOut={signOut} /> : <Desktop onLock={lock} />}
    </div>
  )
}
