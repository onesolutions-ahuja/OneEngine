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
