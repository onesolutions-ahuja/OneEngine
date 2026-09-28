import { apiRequest } from './api'

export async function loadSettingsContext() {
  const [me, permissions, settings] = await Promise.all([
    apiRequest('/api/auth/me'),
    apiRequest('/api/auth/me/permissions'),
    apiRequest('/api/settings'),
  ])

  return {
    user: me?.user || null,
    permissions: permissions?.data || {},
    settings: settings?.data || null,
  }
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
