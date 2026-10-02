export function settingSectionAccess({
  permissions = [],
} = {}) {
  const codes = new Set(Array.isArray(permissions) ? permissions : [])
  const settingsManage = codes.has('settings.manage')
  const oneEngineManage = codes.has('oneengine.manage')
  const mfaManage = settingsManage || codes.has('security.mfa.manage') || codes.has('security.identity_verification_history.view')

  return {
    'Client Web Shop': settingsManage,
    // Licence state must not hide an installed app's Settings. RBAC controls
    // configuration visibility; licence is enforced when licensed logic runs.
    'Customer Loyalty': settingsManage,
    'Server / API Configuration': oneEngineManage,
    Platform: oneEngineManage,
    'Message Templates': settingsManage,
    'MFA Administration': mfaManage,
  }
}

export function sectionIsVisible(access, section) {
  return access?.[section] !== false
}
