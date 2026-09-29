import { apiRequest } from './api'

export async function loadSettingsContext() {
  // Identity + RBAC are platform/session concerns and must not be discarded
  // just because tenant/company settings are unavailable.
  const [me, permissions] = await Promise.all([
    apiRequest('/api/auth/me'),
    apiRequest('/api/auth/me/permissions'),
  ])

  const user = me?.user || null
  let settings = null
  let settingsError = ''

  // Platform identities may legitimately have no company_id. In that case
  // Objects/Platform Settings still work; tenant Settings require an acting
  // company context instead of treating this as an authorization failure.
  if (user?.companyId) {
    try {
      const response = await apiRequest('/api/settings')
      settings = response?.data || null
    } catch (error) {
      settingsError = error?.message || 'Unable to load company settings'
    }
  }

  return {
    user,
    permissions: permissions?.data || {},
    settings,
    settingsError,
    hasCompanyContext: Boolean(user?.companyId),
  }
}

export async function loadSettingsCatalog() {
  const payload = await apiRequest('/api/platform/runtime/settings-catalog')
  return Array.isArray(payload?.data) ? payload.data : []
}

export async function patchSettings(patch) {
  return apiRequest('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
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
  const payload = await apiRequest('/api/platform/metadata')
  const rows = payload?.data?.objects || []
  return Array.isArray(rows) ? rows : []
}
