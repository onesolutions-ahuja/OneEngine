import { apiRequest } from './api'
import { catalogAppForNavigation, readMarketplaceCache, writeMarketplaceCache } from '../utils/appMarketplace'

function manifestOf(item) {
  return item?.manifest || item?.company_installation?.manifest || {}
}

export function runtimeSurfaceFromItem(item, surfaceKey) {
  const manifest = manifestOf(item)
  const surfaces = manifest.runtimeSurfaces || manifest.runtime_surfaces || {}
  return surfaces?.[surfaceKey] && typeof surfaces[surfaceKey] === 'object' ? surfaces[surfaceKey] : null
}

export function readCachedRuntimeSurface(navigationKey, surfaceKey = navigationKey) {
  const rows = readMarketplaceCache()
  const item = catalogAppForNavigation(rows, navigationKey)
  return runtimeSurfaceFromItem(item, surfaceKey)
}

export async function loadRuntimeSurface(navigationKey, surfaceKey = navigationKey) {
  let rows = readMarketplaceCache()
  let item = catalogAppForNavigation(rows, navigationKey)
  let surface = runtimeSurfaceFromItem(item, surfaceKey)
  if (surface) return surface

  const response = await apiRequest('/api/packages/marketplace', { timeoutMs: 12000, retryGet: true })
  rows = Array.isArray(response?.data) ? response.data : []
  if (rows.length) writeMarketplaceCache(rows)
  item = catalogAppForNavigation(rows, navigationKey)
  surface = runtimeSurfaceFromItem(item, surfaceKey)
  if (!surface) {
    const runtimeNavigation = await apiRequest('/api/packages/runtime-navigation', { timeoutMs: 12000, retryGet: true })
    const runtimeRows = Array.isArray(runtimeNavigation?.data) ? runtimeNavigation.data : []
    item = catalogAppForNavigation(runtimeRows, navigationKey)
    surface = runtimeSurfaceFromItem(item, surfaceKey)
  }
  if (!surface) throw new Error(`Runtime surface metadata is unavailable for ${navigationKey}.`)
  return surface
}

export async function loadRuntimeSurfaceSettings(navigationKey, surfaceKey) {
  const surface = await loadRuntimeSurface(navigationKey, surfaceKey)
  const source = String(surface?.settings?.source || '')
  const response = source ? await apiRequest(source) : null
  return { surface, settings: response?.data || response || null }
}

export function surfacePath(source, path, fallback = undefined) {
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) current = current?.[part]
  return current === undefined ? fallback : current
}


export function mapRuntimePayload(mapping, values = {}) {
  const result = {}
  for (const [semanticKey, targetKey] of Object.entries(mapping || {})) {
    if (!targetKey || values?.[semanticKey] === undefined) continue
    result[targetKey] = values[semanticKey]
  }
  return result
}


export function mappedRecordValue(record, mapping, semanticKey, fallback = undefined) {
  const candidates = Array.isArray(mapping?.[semanticKey])
    ? mapping[semanticKey]
    : mapping?.[semanticKey] ? [mapping[semanticKey]] : []
  for (const key of candidates) {
    if (record?.[key] !== undefined && record?.[key] !== null) return record[key]
  }
  return fallback
}


export function runtimeEndpoint(surface, key, params = {}) {
  let value = String(surface?.endpoints?.[key] || '')
  for (const [name, replacement] of Object.entries(params || {})) {
    value = value.replaceAll(`{${name}}`, encodeURIComponent(String(replacement ?? '')))
  }
  return value
}
