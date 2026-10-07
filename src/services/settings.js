import { apiRequest } from './api'

const SETTINGS_CONTEXT_CACHE_KEY = 'onepos.settings.context.v2'

export function clearSettingsContextCache() {
  try { sessionStorage.removeItem(SETTINGS_CONTEXT_CACHE_KEY) } catch {}
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
