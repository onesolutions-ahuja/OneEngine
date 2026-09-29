export function settingSectionAccess({
  permissions = [],
  loyalty = false,
} = {}) {
  const codes = new Set(Array.isArray(permissions) ? permissions : [])
  const settingsManage = codes.has('settings.manage')
  const platformManage = codes.has('platform.manage')

  return {
    'Client Web Shop': settingsManage,
    'Customer Loyalty': loyalty === true,
    'Server / API Configuration': platformManage,
    Platform: platformManage,
    'Message Templates': settingsManage,
  }
}

export function sectionIsVisible(access, section) {
  return access?.[section] !== false
}
