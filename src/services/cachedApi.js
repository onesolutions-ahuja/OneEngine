import { apiRequest } from './api'
import {
  LAZY_CACHE_DEFAULT_TTL_MS,
  LAZY_CACHE_MAX_STALE_MS,
  readLazyCache,
  writeLazyCache,
} from './dataCache'

function cacheKeyFor(path, cacheKey) {
  return cacheKey || String(path || '')
}

function persistWhenIdle(key, value) {
  const run = () => void writeLazyCache(key, value)
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 })
  else setTimeout(run, 0)
}

export async function cachedGet(path, {
  cacheKey = '',
  ttlMs = LAZY_CACHE_DEFAULT_TTL_MS,
  maxStaleMs = LAZY_CACHE_MAX_STALE_MS,
  forceRefresh = false,
  onFresh,
} = {}) {
  const key = cacheKeyFor(path, cacheKey)
  const cached = await readLazyCache(key)
  const now = Date.now()
  const age = cached ? Math.max(0, now - cached.savedAt) : Number.POSITIVE_INFINITY
  const usableCached = cached && age <= maxStaleMs

  const refresh = async () => {
    const fresh = await apiRequest(path)
    // Cache persistence is deliberately deferred until the browser is idle.
    // JSON serialization/encryption must never compete with rendering.
    persistWhenIdle(key, fresh)
    if (typeof onFresh === 'function') {
      try { onFresh(fresh) } catch {}
    }
    return fresh
  }

  if (forceRefresh || !usableCached) {
    try {
      return await refresh()
    } catch (error) {
      if (usableCached) return cached.value
      throw error
    }
  }

  if (age >= ttlMs) {
    // Return cached data immediately. Revalidation is deliberately detached
    // so page rendering never waits on the network.
    void refresh().catch(() => {})
  }

  return cached.value
}

export async function cachedGetMany(requests = []) {
  return Promise.all(requests.map((request) => {
    if (typeof request === 'string') return cachedGet(request)
    return cachedGet(request.path, request.options || {})
  }))
}
