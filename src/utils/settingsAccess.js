export function settingSectionAccess({
  permissions = [],
} = {}) {
  const codes = new Set(Array.isArray(permissions) ? permissions : [])
  const settingsManage = codes.has('settings.manage')
  const platformManage = codes.has('platform.manage')

  return {
    'Client Web Shop': settingsManage,
    // Licence state must not hide an installed app's Settings. RBAC controls
    // configuration visibility; licence is enforced when licensed logic runs.
    'Customer Loyalty': settingsManage,
    'Server / API Configuration': platformManage,
    Platform: platformManage,
    'Message Templates': settingsManage,
  }
}

export function sectionIsVisible(access, section) {
  return access?.[section] !== false
}
