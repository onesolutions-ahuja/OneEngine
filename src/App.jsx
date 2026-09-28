import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { checkBackend, hasSession, login } from './services/api'
import { createRole, createUser, loadPermissions, loadRolePermissions, loadRoles, loadSettingsContext, loadUsers, patchSettings, saveRolePermissions, updateRole, updateUser } from './services/settings'
import { settingSectionAccess, sectionIsVisible } from './utils/settingsAccess'
import JarvisOrb from './components/jarvis/JarvisOrb'
import RecordListView from './components/RecordListView'
import OneBuilder from './pages/settings/OneBuilder'
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
  LayoutGrid,
  Mail,
} from 'lucide-react'

const dockItems = [
  { id: 'finder', label: 'Finder', src: 'https://rdvnui.com/assets/Finder-BnFYQNS_.png', scaled: true },
  { id: 'settings', label: 'Settings', src: 'https://rdvnui.com/assets/Settings-BIHCu_gi.png', scaled: true },
  { id: 'launchpad', label: 'Launchpad', src: 'https://rdvnui.com/assets/Launchpad-wwI6e3wv.png', scaled: true },
  { id: 'jarvis', label: 'Jarvis', src: 'https://rdvnui.com/assets/siri-icon-DMUdF73Y.png', scaled: true },
  { id: 'maps', label: 'Maps', src: 'https://rdvnui.com/assets/Maps-C7aNhhUR.png', scaled: true },
  { id: 'notes', label: 'Notes', src: 'https://rdvnui.com/assets/Notes-fm-2Meh1.png', scaled: true },
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

  return (
    <div className="dock-zone">
      <motion.div
        className="dock"
        onMouseMove={(event) => mouseX.set(event.pageX)}
        onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
        aria-label="Smart Theme dock"
      >
        {dockItems.map((item) => (
          <DockItem
            key={item.id}
            item={item}
            mouseX={mouseX}
            onActivate={() => onItemOpen?.(item.id)}
          />
        ))}
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
        <img
          className={item.scaled ? 'dock-image dock-image--scaled' : 'dock-image'}
          src={item.src}
          alt=""
          draggable="false"
        />
      </span>
    </motion.button>
  )
}

function LockScreen({ onUnlock }) {
  const now = useClock()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
    if (!username.trim() || !password) return
    try {
      setSubmitting(true)
      setError('')
      await login(username.trim(), password)
      onUnlock()
    } catch (err) {
      setError(err?.message || 'Unable to sign in')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="screen lock-screen">
      <div className="wallpaper wallpaper--lock" />
      <div className="lock-vignette" />

      <section className="lock-content" aria-label="Login screen">
        <div className="lock-date">{date}</div>
        <div className="lock-time">{time}</div>

        <form className="login-glass-card" onSubmit={submit}>
          <div className="profile-avatar login-avatar">O</div>
          <div className="login-title">One Solutions</div>
          <div className="login-subtitle">Superadmin test access</div>

          <input
            className="login-field"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username or email"
            autoComplete="username"
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
        </form>
      </section>
    </main>
  )
}

const settingsGroups = [
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
    { key: 'server-api', label: 'Server / API Configuration', icon: MonitorCog, tone: 'gray' },
  ],
  [
    { key: 'platform', label: 'Platform', icon: LayoutGrid, tone: 'cyan', searchTerms: ['onebuilder', 'workflow', 'approval flow', 'dashboard builder', 'report builder', 'canvas', 'components'] },
    { key: 'message-templates', label: 'Message Templates', icon: ReceiptText, tone: 'cyan' },
  ],
]

function SettingsPage() {
  const [active, setActive] = useState('general')
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

  const permissions = context?.permissions || {}
  const permissionCodes = Array.isArray(permissions.permissions) ? permissions.permissions : []
  const isSuperadmin = permissions.isSuperadmin === true
  const isAdmin = permissions.isAdmin === true
  const isPlatformDeveloper = context?.user?.isPlatformDeveloper === true
  const entitlements = permissions.entitlements || {}
  const canManage = isSuperadmin || permissionCodes.includes('settings.manage')
  const canViewUsers = isSuperadmin || isAdmin || permissionCodes.includes('user.view')
  const canCreateUsers = isSuperadmin || isAdmin || permissionCodes.includes('user.create')
  const canEditUsers = isSuperadmin || isAdmin || permissionCodes.includes('user.edit')
  const canManageRoles = isSuperadmin || isAdmin || permissionCodes.includes('role.manage')

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

  const visibleGroups = settingsGroups
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

  useEffect(() => {
    if (current && current.key !== active) setActive(current.key)
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
                  onClick={() => setActive(key)}
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
          ) : !settings ? (
            <div className="settings-card settings-state-card">No settings data available.</div>
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
              ) : (
                    <div className="settings-table-wrap">
                      <table className="settings-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Username</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Store</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((row) => (
                            <tr key={row.id}>
                              <td>{row.full_name || '—'}</td>
                              <td>{row.username || '—'}</td>
                              <td>{row.email || '—'}</td>
                              <td>{row.role_name || '—'}</td>
                              <td>{row.store_name || 'All stores'}</td>
                              <td>
                                <span className={`settings-status-pill ${row.active ? 'is-active' : 'is-inactive'}`}>
                                  {row.active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {users.length === 0 && (
                            <tr>
                              <td colSpan="6" className="settings-table-empty">No users found.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
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

          {!loading && (
            <div className="settings-rbac-note">
              {canManage ? 'Editing allowed by settings.manage / Superadmin.' : 'Read-only: your role does not have settings.manage.'}
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

function Desktop({ onLock }) {
  const [message, setMessage] = useState('Hello.')
  const [activeApp, setActiveApp] = useState('home')
  const now = useClock()

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
    if (id === 'settings') {
      setActiveApp('settings')
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
            onClick={() => { setMessage('Hello.'); setActiveApp('home') }}
            aria-label="One Solutions"
          >
            <span className="one-logo-mark" aria-hidden="true">O</span>
            <span className="one-logo-text" aria-hidden="true">ne</span>
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

        <div className="menubar-right">
          <button type="button" className="status-button" aria-label="Search">
            <Search size={18} strokeWidth={2.1} />
          </button>
          <button type="button" className="status-button" aria-label="Wi-Fi">
            <Wifi size={17} strokeWidth={2.1} />
          </button>
          <button type="button" className="status-button" aria-label="Bluetooth">
            <Bluetooth size={17} strokeWidth={2.1} />
          </button>
          <button type="button" className="status-button" aria-label="Control Center">
            <SlidersHorizontal size={18} strokeWidth={2.2} />
          </button>
          <button type="button" className="status-button" aria-label="Assistant">
            <img
              className="siri-image"
              src="https://rdvnui.com/assets/siri-icon-DMUdF73Y.png"
              alt=""
              draggable="false"
            />
          </button>
          <button type="button" className="menubar-time-button">
            {dateTime}
          </button>
        </div>
      </header>

      {activeApp === 'settings' ? (
        <SettingsPage />
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

  return (
    <div className={`app-shell ${transitioning ? 'is-transitioning' : ''}`}>
      {locked ? <LockScreen onUnlock={unlock} /> : <Desktop onLock={lock} />}
    </div>
  )
}
