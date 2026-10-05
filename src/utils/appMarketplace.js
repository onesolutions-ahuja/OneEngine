import { apiUrl } from '../services/api'

const PNG_APP_ICONS = new Set([])

export const MARKETPLACE_CACHE_KEY = 'onepos.marketplace.catalog.v1'

export function localAppIcon(assetKey = 'default-app') {
  const clean = String(assetKey || 'default-app').trim().toLowerCase().replaceAll('_', '-')
  const safe = /^[a-z0-9-]+$/.test(clean) ? clean : 'default-app'
  const extension = PNG_APP_ICONS.has(safe) ? 'png' : 'svg'
  const base = import.meta.env.BASE_URL || '/'
  return `${base}icons/apps/${safe}.${extension}`
}

export function appIconUrl(item) {
  const objectSvg = typeof item?.svg === 'string' ? item.svg.trim() : ''
  if (objectSvg) return objectSvg
  const manifest = item?.manifest || {}
  const provider = manifest.providerConnector || manifest.provider_connector || {}
  const explicitAsset = item?.icon_asset_key || item?.iconAssetKey || manifest.iconAssetKey || manifest.icon_asset_key
  if (explicitAsset) return localAppIcon(explicitAsset)

  const explicit = item?.icon_url || item?.logo_url || item?.icon
    || manifest.iconUrl || manifest.icon_url || manifest.logoUrl || manifest.logo_url || manifest.icon
    || provider.iconUrl || provider.logoUrl
  if (typeof explicit === 'string' && explicit.trim()) {
    const value = explicit.trim()
    if (/^https?:\/\//i.test(value)) return value
    if (value.startsWith('/icons/apps/')) return `${import.meta.env.BASE_URL || '/'}${value.replace(/^\//, '')}`
    return apiUrl(value.startsWith('/') ? value : `/${value}`)
  }
  return localAppIcon('default-app')
}

export function applyDefaultAppIcon(event) {
  if (!event?.currentTarget) return
  event.currentTarget.onerror = null
  event.currentTarget.src = localAppIcon('default-app')
}

export function readMarketplaceCache() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(MARKETPLACE_CACHE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeMarketplaceCache(items) {
  try {
    if (Array.isArray(items) && items.length) {
      sessionStorage.setItem(MARKETPLACE_CACHE_KEY, JSON.stringify(items))
    }
  } catch {}
}

export function resolveAppOpenRoute(item) {
  const declared = String(
    item?.landing_route || item?.route || item?.manifest?.route
    || item?.company_installation?.manifest?.route || ''
  ).trim()
  if (declared) return declared

  const key = String(item?.package_key || item?.manifest?.packageKey || '')
  const connectorApp = item?.manifest?.connectorApp || item?.company_installation?.manifest?.connectorApp
  if (connectorApp && !connectorApp.template && key) return `/app/connector-settings/${encodeURIComponent(key)}`
  return '/app'
}

export function marketplaceSearchText(item) {
  const manifest = item?.manifest || {}
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities.join(' ') : ''
  const dependencies = Array.isArray(manifest.dependencies) ? manifest.dependencies.map((value) => typeof value === 'string' ? value : value?.packageKey || value?.package_key || '').join(' ') : ''
  return `${item?.name || ''} ${item?.package_key || ''} ${item?.category || ''} ${item?.publisher || ''} ${item?.description || ''} ${capabilities} ${dependencies}`.toLowerCase()
}
