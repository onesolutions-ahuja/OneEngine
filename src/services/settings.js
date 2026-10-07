import { apiRequest, getStoredUser, loadSessionPermissions } from './api'

const SETTINGS_CONTEXT_CACHE_KEY = 'onepos.settings.context.v2'

function currentScope(user = getStoredUser()) {
  const companyId = user?.companyId || user?.company_id || ''
  return {
    userId: String(user?.id || ''),
    companyId: String(companyId || ''),
  }
}

export function readSettingsContextCache() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(SETTINGS_CONTEXT_CACHE_KEY) || 'null')
    if (!cached?.context?.user?.id) return null
    const scope = currentScope()
    if (!scope.userId || String(cached.userId || '') !== scope.userId) return null
    if (String(cached.companyId || '') !== scope.companyId) return null
    return cached.context
  } catch {
    return null
  }
}

function writeSettingsContextCache(context) {
  try {
    const scope = currentScope(context?.user)
    sessionStorage.setItem(SETTINGS_CONTEXT_CACHE_KEY, JSON.stringify({
      userId: scope.userId,
      companyId: scope.companyId,
      savedAt: Date.now(),
      context,
    }))
  } catch {}
}

export function clearSettingsContextCache() {
  try { sessionStorage.removeItem(SETTINGS_CONTEXT_CACHE_KEY) } catch {}
}

export async function loadSettingsContext({ force = false } = {}) {
  const cachedContext = !force ? readSettingsContextCache() : null
  if (cachedContext) return cachedContext

  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()

  /*
   * Fast path: the authenticated user and company binding are already stored
   * by login/session bootstrap. Settings must not rediscover them on every
   * refresh. The server remains authoritative for every protected request.
   */
  let user = getStoredUser()
  if (!user?.id) {
    const me = await apiRequest('/api/auth/me')
    user = me?.user || null
    if (user?.id) {
      try { sessionStorage.setItem('onepos_user', JSON.stringify(user)) } catch {}
    }
  }

  const hasCompanyContext = Boolean(user?.companyId || user?.company_id)
  let settings = null
  let settingsError = ''

  /*
   * RBAC and company settings are independent reads. Fetch them concurrently.
   * Licence checks are intentionally NOT part of Settings bootstrap; licensed
   * actions enforce licence validity at execution time.
   */
  const permissionsPromise = loadSessionPermissions({ includeEntitlements: false })
  // Company/general settings are metadata-owned. The legacy /api/settings
  // aggregate was removed from the runtime, so do not issue a guaranteed 404
  // from every Settings/Dashboard/Developer mount.
  const settingsPromise = Promise.resolve(null)

  const [permissions, settingsResponse] = await Promise.all([
    permissionsPromise,
    settingsPromise,
  ])

  if (settingsResponse?.__settingsError) {
    settingsError = settingsResponse.__settingsError?.message || 'Unable to load company settings'
  } else {
    settings = settingsResponse?.data || null
  }

  const context = {
    user,
    permissions: permissions || {},
    settings,
    settingsError,
    hasCompanyContext,  }

  writeSettingsContextCache(context)

  const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (typeof console !== 'undefined' && console.info) {
    console.info('[onePOS] Settings context loaded', {
      ms: Math.round(endedAt - startedAt),
      cachedIdentity: Boolean(getStoredUser()?.id),
      companyContext: hasCompanyContext,
    })
  }

  return context
}

export async function loadSettingsCatalog() {
  const payload = await apiRequest('/api/platform/runtime/settings-catalog')
  const catalog = payload?.data
  if (Array.isArray(catalog)) return catalog
  if (catalog && typeof catalog === 'object' && Array.isArray(catalog.sections)) return catalog
  return []
}

export async function patchSettings(patch) {
  const result = await apiRequest('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  clearSettingsContextCache()
  return result
}

export async function patchCompanySettings(patch) {
  const result = await apiRequest('/api/settings/company', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  clearSettingsContextCache()
  return result
}

export async function loadUsers() {
  const payload = await apiRequest('/api/admin/users')
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function loadRoles() {
  const payload = await apiRequest('/api/admin/roles')
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function loadPermissions() {
  const payload = await apiRequest('/api/admin/permissions')
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function loadRolePermissions(roleId) {
  const payload = await apiRequest(`/api/admin/roles/${roleId}/permissions`)
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function saveRolePermissions(roleId, permissions) {
  return apiRequest(`/api/admin/roles/${roleId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  })
}

export async function createRole(input) {
  return apiRequest('/api/admin/roles', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateRole(roleId, input) {
  return apiRequest(`/api/admin/roles/${roleId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function createUser(input) {
  return apiRequest('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateUser(userId, input) {
  return apiRequest(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function loadPlatformObjects() {
  const payload = await apiRequest('/api/platform/objects')
  const rows = payload?.data?.objects || payload?.data || []
  return Array.isArray(rows) ? rows : []
}
