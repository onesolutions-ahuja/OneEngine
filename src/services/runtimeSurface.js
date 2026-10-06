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
  if (!surface) throw new Error(`Runtime surface metadata is unavailable for ${navigationKey}.`)
  return surface
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
