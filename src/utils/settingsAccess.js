export function settingSectionAccess({
  permissions = [],
} = {}) {
  const codes = new Set(Array.isArray(permissions) ? permissions : [])
  const settingsManage = codes.has('settings.manage')
  const oneEngineManage = codes.has('oneengine.manage')

  return {
    'Client Web Shop': settingsManage,
    // Licence state must not hide an installed app's Settings. RBAC controls
    // configuration visibility; licence is enforced when licensed logic runs.
    'Customer Loyalty': settingsManage,
    'Server / API Configuration': oneEngineManage,
    Platform: oneEngineManage,
    'Message Templates': settingsManage,
  }
}

export function sectionIsVisible(access, section) {
  return access?.[section] !== false
}
