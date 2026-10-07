export const DEVELOPER_SETTINGS_KEYS = new Set([
  'objects',
  'assignment-rules',
  'sharing-rules',
  'platform',
  'gptbuilder',
  'gptappbuilder',
  'approval-builder',
  'gpt-page-builder',
  'dashboard-builder',
  'report-types',
  'report-builder',
  'workflow-runs',
  'work-items',
  'deployments',
  'notifications',
  'value-sets',
  'debug',
])

const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export function readRoute() {
  const base = APP_BASE || ''
  const path = window.location.pathname.startsWith(base)
    ? window.location.pathname.slice(base.length)
    : window.location.pathname
  const hashPath = String(window.location.hash || '').replace(/^#\/?/, '')
  let routePath = path.replace(/^\/+/, '')
  if (!routePath && hashPath) routePath = hashPath
  // An explicit visit to the application root is the landing route. Do not
  // resurrect a previously opened privileged route (for example OneDeveloper)
  // from session state, because that can strand a normal tenant user on an
  // authorization error even though the URL is the root.
  const parts = routePath.split('/').filter(Boolean)
  if (parts[0] === 'settings') {
    const section = !parts[1] || parts[1] === 'general' ? 'company' : parts[1]
    if (DEVELOPER_SETTINGS_KEYS.has(section)) {
      const developerSection = section === 'platform' || section === 'workflow-builder'
        ? 'gptbuilder'
        : section === 'page-builder'
          ? 'gpt-page-builder'
          : section
      return { app: 'developer', section: developerSection }
    }
    return { app: 'settings', section }
  }
  if (parts[0] === 'developer') {
    const requestedSection = parts[1] || 'objects'
    const section = requestedSection === 'workflow-builder' || requestedSection === 'builder-2'
      ? 'gptbuilder'
      : requestedSection === 'platform-apps'
        ? 'gptappbuilder'
        : requestedSection === 'page-builder'
          ? 'gpt-page-builder'
          : requestedSection
    const params = new URLSearchParams(window.location.search || '')
    const workflowId = section === 'gptbuilder'
      ? decodeURIComponent(parts[2] || params.get('workflowId') || '')
      : ''
    return { app: 'developer', section, workflowId }
  }
  if (parts[0] === 'dashboard') return { app: 'dashboard', section: null }
  if (parts[0] === 'flow' && parts[1]) return { app: 'flow-runtime', section: null, sessionId: decodeURIComponent(parts[1]) }
  if (parts[0] === 'profile') return { app: 'profile', section: null }
  // Installed application slugs are metadata-owned; preserve the slug generically.
  if (parts[0] && !['workspace', 'objects'].includes(parts[0])) {
    return { app: decodeURIComponent(parts[0]), section: null }
  }
  if (parts[0] === 'workspace' && parts[1] === 'pages' && parts[2]) return { app: 'custom-page-runtime', section: null, pageKey: decodeURIComponent(parts[2]) }
  if (parts[0] === 'workspace') {
    const objectKey = parts[1] ? decodeURIComponent(parts[1]) : ''
    const recordId = parts[2] === 'records' && parts[3] ? decodeURIComponent(parts[3]) : ''
    return { app: 'workspace', section: null, objectKey, recordId, appKey: '' }
  }
  if (parts[0] === 'objects') {
    const objectKey = parts[1] ? decodeURIComponent(parts[1]) : ''
    const recordId = parts[2] === 'records' && parts[3] ? decodeURIComponent(parts[3]) : ''
    const params = new URLSearchParams(window.location.search || '')
    const appKey = params.get('appKey') || ''
    return { app: 'workspace', section: null, objectKey, recordId, appKey }
  }
  return { app: 'home', section: null }
}

export function setRoute(app, section = null, options = {}) {
  const base = APP_BASE || ''
  const next = app === 'settings'
    ? `${base}/settings${section && section !== 'general' ? `/${section}` : ''}`
    : app === 'developer'
      ? `${base}/developer${section && section !== 'objects' ? `/${section}` : ''}${section === 'gptbuilder' && options?.workflowId ? `?workflowId=${encodeURIComponent(options.workflowId)}` : ''}`
    : app === 'dashboard'
      ? `${base}/dashboard`
      : app === 'flow-runtime'
        ? `${base}/flow/${encodeURIComponent(options?.sessionId || '')}`
      : app === 'profile'
        ? `${base}/profile`
      : app === 'custom-page-runtime'
        ? `${base}/workspace/pages/${encodeURIComponent(options?.pageKey || '')}`
      : app === 'workspace'
        ? options?.objectKey
          ? options?.appKey
            ? `${base}/objects/${encodeURIComponent(options.objectKey)}${options.recordId ? `/records/${encodeURIComponent(options.recordId)}` : ''}?appKey=${encodeURIComponent(options.appKey)}`
            : `${base}/workspace/${encodeURIComponent(options.objectKey)}${options.recordId ? `/records/${encodeURIComponent(options.recordId)}` : ''}`
          : `${base}/workspace`
      : app
        ? `${base}/${encodeURIComponent(app)}`
        : `${base}/`

  try { sessionStorage.setItem('onepos.lastRoute', next) } catch {}
  const current = `${window.location.pathname}${window.location.search}`
  if (current !== next) window.history.pushState(null, '', next)
}
