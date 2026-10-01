export const DEVELOPER_SETTINGS_KEYS = new Set([
  'objects',
  'assignment-rules',
  'sharing-rules',
  'platform',
  'workflow-builder',
  'approval-builder',
  'page-builder',
  'dashboard-builder',
  'report-builder',
  'workflow-runs',
  'work-items',
  'platform-apps',
  'deployments',
  'notifications',
  'value-sets',
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
  if (!routePath) {
    try {
      const remembered = sessionStorage.getItem('onepos.lastRoute') || ''
      routePath = remembered.startsWith(base) ? remembered.slice(base.length).replace(/^\/+/, '') : remembered.replace(/^\/+/, '')
    } catch {}
  }
  const parts = routePath.split('/').filter(Boolean)
  if (parts[0] === 'settings') {
    const section = !parts[1] || parts[1] === 'general' ? 'company' : parts[1]
    if (DEVELOPER_SETTINGS_KEYS.has(section)) return { app: 'developer', section: section === 'platform' ? 'workflow-builder' : section }
    return { app: 'settings', section }
  }
  if (parts[0] === 'developer') return { app: 'developer', section: parts[1] || 'objects' }
  if (parts[0] === 'dashboard') return { app: 'dashboard', section: null }
  if (parts[0] === 'till') return { app: 'till', section: null }
  if (parts[0] === 'customer-display') return { app: 'customer-display', section: null }
  if (parts[0] === 'profile') return { app: 'profile', section: null }
  if (parts[0] === 'sales') return { app: 'sales', section: null }
  if (parts[0] === 'returns') return { app: 'returns', section: null }
  if (parts[0] === 'exchange') return { app: 'exchange', section: null }
  if (parts[0] === 'layaway') return { app: 'layaway', section: null }
  if (parts[0] === 'supplier-returns') return { app: 'supplier-returns', section: null }
  if (parts[0] === 'audit-log') return { app: 'audit-log', section: null }
  if (parts[0] === 'licensing') return { app: 'licensing', section: null }
  if (parts[0] === 'app-releases') return { app: 'app-releases', section: null }
  if (parts[0] === 'products') return { app: 'products', section: null }
  if (parts[0] === 'categories') return { app: 'categories', section: null }
  if (parts[0] === 'global-products') return { app: 'global-products', section: null }
  if (parts[0] === 'inventory') return { app: 'inventory', section: null }
  if (parts[0] === 'replenishment') return { app: 'replenishment', section: null }
  if (parts[0] === 'purchases') return { app: 'purchases', section: null }
  if (parts[0] === 'suppliers') return { app: 'suppliers', section: null }
  if (parts[0] === 'customers') return { app: 'customers', section: null }
  if (parts[0] === 'gift-cards') return { app: 'gift-cards', section: null }
  if (parts[0] === 'employees') return { app: 'employees', section: null }
  if (parts[0] === 'stores') return { app: 'stores', section: null }
  if (parts[0] === 'reports') return { app: 'reports', section: null }
  if (parts[0] === 'custom-reports') return { app: 'custom-reports', section: null }
  if (parts[0] === 'integrations') return { app: 'integrations', section: null }
  if (parts[0] === 'google-connect') return { app: 'google-connect', section: null }
  if (parts[0] === 'connector-settings') return { app: 'connector-settings', section: null, packageKey: parts[1] ? decodeURIComponent(parts[1]) : '' }
  if (parts[0] === 'accounting') return { app: 'accounting', section: null }
  if (parts[0] === 'online-orders') return { app: 'online-orders', section: null }
  if (parts[0] === 'order-prep') return { app: 'order-prep', section: null }
  if (parts[0] === 'own-delivery') return { app: 'own-delivery', section: null }
  if (parts[0] === 'assistant' && parts[1] === 'book' && parts[2]) return { app: 'public-assistant-booking', section: null, token: decodeURIComponent(parts[2]) }
  if (parts[0] === 'assistant') return { app: 'assistant', section: null }
  if (parts[0] === 'kiosk-runtime') return { app: 'kiosk-runtime', section: null }
  if (parts[0] === 'kiosk') return { app: 'kiosk', section: null }
  if (parts[0] === 'kiosk-display') return { app: 'kiosk-display', section: null }
  if (parts[0] === 'kiosk-devices') return { app: 'kiosk-devices', section: null }
  if (parts[0] === 'workspace') {
    const objectKey = parts[1] ? decodeURIComponent(parts[1]) : ''
    const recordId = parts[2] === 'records' && parts[3] ? decodeURIComponent(parts[3]) : ''
    return { app: 'workspace', section: null, objectKey, recordId }
  }
  return { app: 'home', section: null }
}

export function setRoute(app, section = null, options = {}) {
  const base = APP_BASE || ''
  const next = app === 'settings'
    ? `${base}/settings${section && section !== 'general' ? `/${section}` : ''}`
    : app === 'developer'
      ? `${base}/developer${section && section !== 'objects' ? `/${section}` : ''}`
    : app === 'dashboard'
      ? `${base}/dashboard`
    : app === 'till'
      ? `${base}/till`
      : app === 'profile'
        ? `${base}/profile`
      : app === 'sales'
        ? `${base}/sales`
      : app === 'returns'
        ? `${base}/returns`
      : app === 'exchange'
        ? `${base}/exchange`
      : app === 'layaway'
        ? `${base}/layaway`
      : app === 'supplier-returns'
        ? `${base}/supplier-returns`
      : app === 'products'
        ? `${base}/products`
      : app === 'categories'
        ? `${base}/categories`
      : app === 'global-products'
        ? `${base}/global-products`
      : app === 'inventory'
        ? `${base}/inventory`
      : app === 'replenishment'
        ? `${base}/replenishment`
      : app === 'purchases'
        ? `${base}/purchases`
      : app === 'suppliers'
        ? `${base}/suppliers`
      : app === 'customers'
        ? `${base}/customers`
      : app === 'gift-cards'
        ? `${base}/gift-cards`
      : app === 'employees'
        ? `${base}/employees`
      : app === 'stores'
        ? `${base}/stores`
      : app === 'reports'
        ? `${base}/reports`
      : app === 'custom-reports'
        ? `${base}/custom-reports`
      : app === 'integrations'
        ? `${base}/integrations`
      : app === 'google-connect'
        ? `${base}/google-connect`
      : app === 'connector-settings'
        ? `${base}/connector-settings/${encodeURIComponent(options?.packageKey || '')}`
      : app === 'accounting'
        ? `${base}/accounting`
      : app === 'online-orders'
        ? `${base}/online-orders`
      : app === 'order-prep'
        ? `${base}/order-prep`
      : app === 'own-delivery'
        ? `${base}/own-delivery`
      : app === 'assistant'
        ? `${base}/assistant`
      : app === 'kiosk-runtime'
        ? `${base}/kiosk-runtime`
      : app === 'kiosk'
        ? `${base}/kiosk`
      : app === 'kiosk-display'
        ? `${base}/kiosk-display`
      : app === 'kiosk-devices'
        ? `${base}/kiosk-devices`
      : app === 'audit-log'
        ? `${base}/audit-log`
      : app === 'licensing'
        ? `${base}/licensing`
      : app === 'app-releases'
        ? `${base}/app-releases`
      : app === 'workspace'
        ? options?.objectKey
          ? `${base}/workspace/${encodeURIComponent(options.objectKey)}${options.recordId ? `/records/${encodeURIComponent(options.recordId)}` : ''}`
          : `${base}/workspace`
        : `${base}/`
  try { sessionStorage.setItem('onepos.lastRoute', next) } catch {}
  if (window.location.pathname !== next) window.history.pushState(null, '', next)
}
