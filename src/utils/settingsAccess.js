export function settingSectionAccess({
  permissions = [],
} = {}) {
  const codes = new Set(Array.isArray(permissions) ? permissions : [])
  const settingsManage = codes.has('settings.manage')
  const oneEngineManage = codes.has('oneengine.manage')
  const mfaManage = settingsManage || codes.has('security.mfa.manage')
  const verificationHistoryView = mfaManage || codes.has('security.identity_verification_history.view')
  const securityGovernance = settingsManage || codes.has('security.governance.manage')

  return {
    'Client Web Shop': settingsManage,
    // Licence state must not hide an installed app's Settings. RBAC controls
    // configuration visibility; licence is enforced when licensed logic runs.
    'Customer Loyalty': settingsManage,
    'Server / API Configuration': oneEngineManage,
    Platform: oneEngineManage,
    'Message Templates': settingsManage,
    'MFA Administration': mfaManage,
    'Identity Verification History': verificationHistoryView,
    'Security Governance': securityGovernance,
  }
}

export function sectionIsVisible(access, section) {
  return access?.[section] !== false
}
