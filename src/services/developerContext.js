import { readRoute } from '../navigation/routes'

// Only metadata tools inside OneDeveloper may use the selected client target.
// The server still authorizes every target and operation through RBAC.
export function developerMetadataHeaders(path) {
  if (typeof window === 'undefined' || readRoute().app !== 'developer') return {}
  let permissions
  try { permissions = JSON.parse(sessionStorage.getItem('onepos_session_permissions') || '{}') } catch { return {} }
  if (!Array.isArray(permissions.permissions) || !permissions.permissions.includes('oneengine.manage')) return {}
  const pathname = new URL(path, window.location.origin).pathname
  const savedWorkflowTestRun = /^\/api\/platform\/rules\/[^/]+\/tests\/[^/]+\/run\/?$/.test(pathname)
  const metadata = /^\/api\/platform\/(metadata|objects|relationships|rules|approval-processes|approval-roles|apps|pages|layouts|reports|value-sets|value-set-values|deployments|notification-subscriptions)(\/|$)/.test(pathname)
    && (!/\/(records|execute|run)(\/|$)/.test(pathname) || savedWorkflowTestRun)
  const dashboardBuilder = readRoute().section === 'dashboard-builder' && /^\/api\/dashboards(\/|$)/.test(pathname)
  const reportBuilder = readRoute().section === 'report-builder' && /^\/api\/reports\/custom(\/|$)/.test(pathname)
  const target = sessionStorage.getItem('onepos_developer_target_company_id') || ''
  return target && (metadata || dashboardBuilder || reportBuilder) ? { 'X-Acting-Company-Id': target } : {}
}
