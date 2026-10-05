import { developerMetadataHeaders } from './developerContext'
import { clearLazyCache } from './dataCache'
import { isPrivilegedMutation, resolveTrustedCapability, trustedRuntimeHeaders, validateTrustedRuntime } from './trustedRuntime'
export const TRUSTED_RUNTIME_STATE = validateTrustedRuntime()

const DEFAULT_API_BASE = String(import.meta.env.VITE_API_BASE || 'https://oneengine-6gas.onrender.com').replace(/\/$/, '')
const CANONICAL_PRODUCTION_API_HOST = 'oneengine-6gas.onrender.com'
export const SERVER_ADDRESS_STORAGE_KEY = 'onepos_server_address'
export const ACTING_COMPANY_STORAGE_KEY = 'onepos_developer_target_company_id'
export const SESSION_PERMISSIONS_STORAGE_KEY = 'onepos_session_permissions'
export const ACTIVE_STORE_STORAGE_KEY = 'onepos_active_store_id'
export const AVAILABLE_STORES_STORAGE_KEY = 'onepos_available_stores'
export const KIOSK_TOKEN_STORAGE_KEY = 'onepos_kiosk_token'
export const KIOSK_DISPLAY_TOKEN_STORAGE_KEY = 'onepos_kiosk_display_token'
export const DEVICE_KEY_STORAGE_KEY = 'onepos_device_key'

export function getDeviceKey() {
  try {
    let value = localStorage.getItem(DEVICE_KEY_STORAGE_KEY) || ''
    if (!value) {
      value = typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).slice(2,10)}`
      localStorage.setItem(DEVICE_KEY_STORAGE_KEY, value)
    }
    return value
  } catch {
    return 'device-local'
  }
}

export function getActingCompanyId() {
  try { return sessionStorage.getItem(ACTING_COMPANY_STORAGE_KEY) || '' } catch { return '' }
}

export function setActingCompanyId(companyId) {
  try {
    if (companyId) sessionStorage.setItem(ACTING_COMPANY_STORAGE_KEY, String(companyId))
    else sessionStorage.removeItem(ACTING_COMPANY_STORAGE_KEY)
  } catch {}
}

export function getActiveStoreId() {
  try {
    const id = localStorage.getItem(ACTIVE_STORE_STORAGE_KEY) || ''
    return getAvailableStores().some((store) => String(store.id) === id) ? id : ''
  } catch { return '' }
}

export function setActiveStoreId(storeId) {
  if (storeId && !getAvailableStores().some((store) => String(store.id) === String(storeId))) storeId = ''
  try {
    if (storeId) localStorage.setItem(ACTIVE_STORE_STORAGE_KEY, String(storeId))
    else localStorage.removeItem(ACTIVE_STORE_STORAGE_KEY)
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('onepos:store-context-changed', { detail: { storeId: storeId || '' } }))
  }
}

export function getAvailableStores() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(AVAILABLE_STORES_STORAGE_KEY) || '[]')
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

function resolveActiveStoreFromRows(stores = []) {
  const rows = Array.isArray(stores) ? stores : []
  const remembered = localStorage.getItem(ACTIVE_STORE_STORAGE_KEY) || ''
  const rememberedAllowed = rows.some((store) => String(store.id) === String(remembered))
  const primary = rows.find((store) => store.is_primary === true)
  const selected = rememberedAllowed
    ? remembered
    : primary?.id || rows[0]?.id || ''
  setActiveStoreId(selected || '')
  return { stores: rows, activeStoreId: selected || '' }
}

export async function ensureActiveStoreContext({ force = false } = {}) {
  const companyId = getStoredUser()?.companyId || getStoredUser()?.company_id
  let cacheInitialized = false
  try { cacheInitialized = sessionStorage.getItem(AVAILABLE_STORES_STORAGE_KEY) !== null } catch {}

  if (!force && companyId && cacheInitialized) {
    return resolveActiveStoreFromRows(getAvailableStores())
  }

  const response = await apiRequest('/api/auth/me/stores', { timeoutMs: 5000, retryGet: false })
  const stores = companyId && Array.isArray(response?.data)
    ? response.data.filter((store) => !(store.companyId || store.company_id) || String(store.companyId || store.company_id) === String(companyId))
    : []
  sessionStorage.setItem(AVAILABLE_STORES_STORAGE_KEY, JSON.stringify(stores))
  return resolveActiveStoreFromRows(stores)
}


export function getStoredSessionPermissions() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SESSION_PERMISSIONS_STORAGE_KEY) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function setStoredSessionPermissions(value) {
  try {
    if (value && typeof value === 'object') sessionStorage.setItem(SESSION_PERMISSIONS_STORAGE_KEY, JSON.stringify(value))
    else sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  } catch {}
}

const permissionsInFlight = new Map()
export async function loadSessionPermissions({ force = false, includeEntitlements = false } = {}) {
  if (!force) {
    const cached = getStoredSessionPermissions()
    if (cached && (!includeEntitlements || cached?.entitlements !== undefined)) return cached
  }
  const key = includeEntitlements ? 'with-entitlements' : 'permissions-only'
  const existing = permissionsInFlight.get(key)
  if (existing) return existing
  const suffix = includeEntitlements ? '' : '?includeEntitlements=0'
  const request = apiRequest(`/api/auth/me/permissions${suffix}`)
    .then((response) => {
      const data = response?.data || {}
      setStoredSessionPermissions(data)
      return data
    })
    .finally(() => {
      if (permissionsInFlight.get(key) === request) permissionsInFlight.delete(key)
    })
  permissionsInFlight.set(key, request)
  return request
}

export function normaliseServerAddress(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)
  if (hasScheme && !/^https?:\/\//i.test(raw)) return ''
  const candidate = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    const parsed = new URL(candidate)
    return parsed.hostname ? parsed.origin : ''
  } catch {
    return ''
  }
}

export function getApiBase() {
  /*
   * GitHub Pages / hosted Smart Theme must always use the configured production
   * API. A stale device override from local/mobile testing must never redirect
   * authentication to an old backend.
   */
  if (typeof window !== 'undefined' && /\.github\.io$/i.test(window.location.hostname)) {
    return DEFAULT_API_BASE
  }
  try {
    const stored = normaliseServerAddress(localStorage.getItem(SERVER_ADDRESS_STORAGE_KEY))
    if (stored) return stored
  } catch {}
  return DEFAULT_API_BASE
}

export function setDeviceServerAddress(value) {
  const next = normaliseServerAddress(value)
  try {
    if (next) localStorage.setItem(SERVER_ADDRESS_STORAGE_KEY, next)
    else localStorage.removeItem(SERVER_ADDRESS_STORAGE_KEY)
  } catch {}
  return next
}

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  const base = getApiBase()
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

function contextHeaders(path, supplied = {}) {
  const headers = new Headers(supplied)
  headers.delete('X-Acting-Company-Id')
  headers.delete('X-Store-Id')
  headers.delete('X-One-Device-Key')
  const deviceKey = getDeviceKey()
  if (deviceKey) headers.set('X-One-Device-Key', deviceKey)
  const storeId = getActiveStoreId()
  if (storeId) headers.set('X-Store-Id', storeId)
  const metadataHeaders = developerMetadataHeaders(path)
  if (metadataHeaders['X-Acting-Company-Id']) headers.delete('X-Store-Id')
  return { ...Object.fromEntries(headers), ...metadataHeaders }
}

function clearCompanyContext() {
  setActingCompanyId('')
  localStorage.removeItem('onepos_acting_company_id')
  sessionStorage.removeItem(AVAILABLE_STORES_STORAGE_KEY)
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (isPrivilegedMutation(path, method)) {
    throw Object.assign(new Error('Privileged mutations must use the OneEngine Trusted Runtime API gate'), {
      status: 403,
      code: 'TRUSTED_RUNTIME_REQUIRED',
    })
  }
  const kioskRuntime = typeof window !== 'undefined' && /\/kiosk-runtime\/?$/.test(window.location.pathname)
  const kioskDisplay = typeof window !== 'undefined' && /\/kiosk-display\/?$/.test(window.location.pathname)
  const kioskToken = kioskRuntime ? (localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY) || '') : ''
  const displayToken = kioskDisplay ? (localStorage.getItem(KIOSK_DISPLAY_TOKEN_STORAGE_KEY) || '') : ''
  const token = kioskToken || displayToken || sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
  return fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),      ...contextHeaders(path, options.headers),
    },
  })
}

const DEFAULT_REQUEST_TIMEOUT_MS = 12000
const SAFE_GET_RETRY_STATUSES = new Set([429, 502, 503, 504])
const OE_CODE_RE = /^OE[A-Z]{2}[0-9]{2,3}$/

function networkFailureSignature(error) {
  return `${String(error?.code || '')} ${String(error?.name || '')} ${String(error?.message || '')} ${String(error?.cause?.code || '')} ${String(error?.cause?.message || '')}`
}

export async function diagnoseClientNetworkFailure(path, {
  method = 'GET',
  headers = {},
  error = null,
  timeoutMs = 2200,
} = {}) {
  const signature = networkFailureSignature(error)
  const apiBase = getApiBase()
  const diagnostic = {
    apiBase,
    route: String(path || ''),
    method: String(method || 'GET').toUpperCase(),
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    requestedHeaders: Object.keys(headers || {}).map((key) => String(key).toLowerCase()).sort(),
    stage: 'transport',
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { code: 'OEND01', ...diagnostic, cause: 'DEVICE_OFFLINE' }
  }
  if (/API_TIMEOUT|TimeoutError|timed out/i.test(signature)) {
    return { code: 'OENT102', ...diagnostic, cause: 'API_TIMEOUT' }
  }
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED/i.test(signature)) {
    return { code: 'OEND101', ...diagnostic, cause: 'DNS_RESOLUTION_FAILED' }
  }
  if (/ERR_CERT|CERT_|SSL_|TLS_|certificate|handshake/i.test(signature)) {
    return { code: 'OENT101', ...diagnostic, cause: 'TLS_HANDSHAKE_FAILED' }
  }
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(signature)) {
    return { code: 'OENR102', ...diagnostic, cause: 'CONNECTION_REFUSED' }
  }

  try {
    const parsed = new URL(apiBase)
    if (typeof window !== 'undefined' && /\.github\.io$/i.test(window.location.hostname) && parsed.hostname !== CANONICAL_PRODUCTION_API_HOST) {
      return { code: 'OENC101', ...diagnostic, cause: 'API_BASE_MISMATCH', expectedHost: CANONICAL_PRODUCTION_API_HOST, actualHost: parsed.hostname }
    }
  } catch {}

  // A simple CORS GET does not preflight. If it succeeds while the original
  // request failed, transport is healthy and the failure is in CORS/preflight.
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let health
    try {
      health = await fetch(`${apiBase}/api/health`, { method: 'GET', cache: 'no-store', signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
    if (health) {
      const requested = new Set(diagnostic.requestedHeaders)
      if (requested.has('x-one-device-key')) {
        return { code: 'OENX101', ...diagnostic, cause: 'CORS_HEADER_BLOCKED', blockedHeader: 'X-One-Device-Key', healthStatus: health.status }
      }
      const simpleMethods = new Set(['GET', 'HEAD', 'POST'])
      if (!simpleMethods.has(diagnostic.method)) {
        return { code: 'OENX103', ...diagnostic, cause: 'CORS_METHOD_BLOCKED', healthStatus: health.status }
      }
      return { code: 'OENX104', ...diagnostic, cause: 'CORS_PREFLIGHT_FAILED', healthStatus: health.status }
    }
  } catch {
    // no-op: distinguish origin-CORS from lower transport below
  }

  // no-cors can succeed when CORS blocks JavaScript from reading the response.
  // If it resolves, the host is reachable and the normal CORS origin is blocked.
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      await fetch(`${apiBase}/api/health`, { method: 'GET', cache: 'no-store', mode: 'no-cors', signal: controller.signal })
      return { code: 'OENX102', ...diagnostic, cause: 'CORS_ORIGIN_BLOCKED' }
    } finally {
      clearTimeout(timer)
    }
  } catch {}

  return { code: 'OENR101', ...diagnostic, cause: 'BROWSER_TRANSPORT_UNREACHABLE' }
}

function clientDebugCode(error, status = 0, payload = null) {
  const explicit = String(payload?.oeCode || payload?.code || error?.oeCode || '').toUpperCase()
  if (OE_CODE_RE.test(explicit)) return explicit
  const technicalCode = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '')
  if (technicalCode === 'UNREGISTERED_CAPABILITY') return 'OEXR01'
  if (technicalCode === 'CAPABILITY_MISMATCH') return 'OEXC01'
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'OEND01'
  if (error?.code === 'API_TIMEOUT' || error?.name === 'TimeoutError') return 'OENT01'
  if (/indexeddb|local storage|cache/i.test(message) && /fail|unavailable|abort|quota/i.test(message)) return 'OECI01'
  if (/offline.*sync|sync.*offline|offline queue/i.test(message)) return 'OECS01'
  if (/failed to fetch dynamically imported module|loading chunk|module script/i.test(message)) return 'OEFL01'
  if (error?.name === 'TypeError' || error?.name === 'NetworkError' || /failed to fetch|networkerror|network request failed/i.test(message)) return 'OENR01'
  if (status === 401) return 'OEUA01'
  if (status === 403) return 'OERP01'
  if (status === 404) return 'OEAF01'
  if (status === 429) return 'OEAR01'
  if ([502, 503, 504].includes(status)) return 'OEAA01'
  return status >= 500 ? 'OEAE01' : ''
}

function defaultDebugMessage(code) {
  const messages = {
    OENH01: 'OneEngine is temporarily unavailable.',
    OENC101: 'OneEngine is configured to use the wrong API service.',
    OENO101: 'This device is configured to use an unavailable OneEngine server.',
    OENX101: 'OneEngine could not connect because the browser blocked an API request.',
    OENX102: 'OneEngine could not connect because this web origin is not allowed.',
    OENX103: 'OneEngine could not connect because the browser blocked this API method.',
    OENX104: 'OneEngine could not connect because the browser preflight check failed.',
    OEND101: 'The OneEngine service address could not be resolved.',
    OENT101: 'A secure connection to OneEngine could not be established.',
    OENT102: 'OneEngine did not respond in time.',
    OENR101: 'OneEngine service could not be reached.',
    OENR102: 'The OneEngine service refused the connection.',
    OENH101: 'OneEngine is reachable but is not healthy.',
    OENR01: 'OneEngine service could not be reached.',
    OEND01: 'This device appears to be offline.',
    OENT01: 'OneEngine did not respond in time.',
    OEAA01: 'The requested OneEngine service is unavailable.',
    OEAE01: 'OneEngine could not complete this request.',
    OEAR01: 'Too many requests. Please try again shortly.',
    OEAF01: 'The requested service could not be found.',
    OERP01: 'You do not have permission to perform this action.',
    OEUA01: 'Please sign in again to continue.',
    OEFR01: 'This screen could not be displayed.',
    OEFL01: 'This page could not be loaded.',
    OECI01: 'Local data could not be loaded. Please refresh and try again.',
    OECS01: 'Offline changes could not be synchronised.',
    OEXR01: 'This operation is not registered in OneEngine.',
    OEXC01: 'This operation failed a trusted-runtime check.',
  }
  return messages[code] || 'OneEngine could not complete this request.'
}

export function oneEngineErrorText(error) {
  if (!error) return 'OneEngine could not complete this request. Error OEAE01'
  const code = clientDebugCode(error, error?.status || 0, error?.payload)
  const raw = String(error?.userMessage || error?.payload?.message || error?.message || '').trim()
  const message = raw && !/failed to fetch|networkerror|network request failed|server is starting/i.test(raw)
    ? raw.replace(/\s*\(?Error\s+OE[A-Z]{2}[0-9]{2}\)?\s*$/i, '').trim()
    : defaultDebugMessage(code || 'OEAE01')
  return code ? `${message} Error ${code}${error?.reference ? ` · Ref ${error.reference}` : ''}` : message
}

function normalizeOneEngineError(error, { status = 0, payload = null } = {}) {
  const oeCode = clientDebugCode(error, status, payload)
  if (!oeCode) return error
  const normalized = error instanceof Error ? error : new Error(String(error || 'Request failed'))
  normalized.status = status || normalized.status
  normalized.payload = payload ?? normalized.payload
  normalized.oeCode = oeCode
  normalized.reference = payload?.reference || normalized.reference || ''
  normalized.userMessage = payload?.message || defaultDebugMessage(oeCode)
  normalized.message = oneEngineErrorText(normalized)
  return normalized
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const upstreamSignal = options.signal
  let timedOut = false

  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason)
  if (upstreamSignal?.aborted) controller.abort(upstreamSignal.reason)
  else upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true })

  const timeout = timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
    : null

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      throw Object.assign(
        new Error(`Server did not respond within ${Math.ceil(timeoutMs / 1000)} seconds. Please retry.`),
        { name: 'TimeoutError', code: 'API_TIMEOUT' }
      )
    }
    throw error
  } finally {
    if (timeout) clearTimeout(timeout)
    upstreamSignal?.removeEventListener?.('abort', abortFromUpstream)
  }
}

const apiRequestInFlight = new Map()

function apiRequestDedupeKey(path, token) {
  const actingCompanyId = getActingCompanyId()
  const storeId = getActiveStoreId()
  return [String(path || ''), String(token || ''), String(actingCompanyId || ''), String(storeId || '')].join('|')
}

export function apiRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const kioskRuntime = typeof window !== 'undefined' && /\/kiosk-runtime\/?$/.test(window.location.pathname)
  const kioskDisplay = typeof window !== 'undefined' && /\/kiosk-display\/?$/.test(window.location.pathname)
  const kioskToken = kioskRuntime ? (localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY) || '') : ''
  const displayToken = kioskDisplay ? (localStorage.getItem(KIOSK_DISPLAY_TOKEN_STORAGE_KEY) || '') : ''
  const token = kioskToken || displayToken || sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
  const canDedupe = method === 'GET' && options.dedupe !== false && !options.signal && !options.body && !options.headers
  if (!canDedupe) return apiRequestCore(path, options, token)

  const key = apiRequestDedupeKey(path, token)
  const existing = apiRequestInFlight.get(key)
  if (existing) return existing

  const request = apiRequestCore(path, options, token).finally(() => {
    if (apiRequestInFlight.get(key) === request) apiRequestInFlight.delete(key)
  })
  apiRequestInFlight.set(key, request)
  return request
}

async function apiRequestCore(path, options = {}, tokenOverride = '') {
  const method = String(options.method || 'GET').toUpperCase()
  const capability = resolveTrustedCapability(path, method)
  if (isPrivilegedMutation(path, method) && !capability) {
    throw Object.assign(new Error('This operation is not registered in OneEngine Trusted Runtime'), {
      status: 403,
      code: 'UNREGISTERED_CAPABILITY',
    })
  }

  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    retryGet = true,
    dedupe: _dedupe = true,
    ...fetchOptions
  } = options
  void _dedupe
  const token = tokenOverride || sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
  const maxAttempts = method === 'GET' && retryGet ? 2 : 1
  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(apiUrl(path), {
        ...fetchOptions,
        headers: {
          Accept: 'application/json',
          ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...trustedRuntimeHeaders(capability),
          ...contextHeaders(path, fetchOptions.headers),
        },
      }, timeoutMs)

      if (attempt + 1 < maxAttempts && SAFE_GET_RETRY_STATUSES.has(response.status)) {
        await delay(700)
        continue
      }

      const contentType = response.headers.get('content-type') || ''
      const body = contentType.includes('application/json') ? await response.json() : await response.text()

      if (!response.ok) {
        const message = typeof body === 'object' && body?.message ? body.message : `Request failed (${response.status})`
        const error = Object.assign(new Error(message), {
          status: response.status,
          code: typeof body === 'object' ? body?.code : undefined,
          payload: body,
          reference: typeof body === 'object' ? body?.reference : undefined,
        })
        throw normalizeOneEngineError(error, { status: response.status, payload: body })
      }

      return body
    } catch (error) {
      if (!error?.status && (
        error?.name === 'TypeError' ||
        error?.name === 'NetworkError' ||
        error?.name === 'TimeoutError' ||
        error?.code === 'API_TIMEOUT' ||
        /failed to fetch|networkerror|network request failed/i.test(String(error?.message || ''))
      )) {
        const requestHeaders = {
          Accept: 'application/json',
          ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...trustedRuntimeHeaders(capability),
          ...contextHeaders(path, fetchOptions.headers),
        }
        const diagnostic = await diagnoseClientNetworkFailure(path, {
          method,
          headers: requestHeaders,
          error,
        })
        error.oeCode = diagnostic.code
        error.diagnostic = diagnostic
        error.code = error.code || diagnostic.cause
      }
      const normalizedError = normalizeOneEngineError(error, {
        status: error?.status || 0,
        payload: error?.payload || null,
      })
      lastError = normalizedError
      const externalAbort = fetchOptions.signal?.aborted === true
      const retryableNetworkFailure =
        !externalAbort &&
        (normalizedError?.code === 'API_TIMEOUT' || ['OENH01','OENR01','OEND01','OENT01'].includes(normalizedError?.oeCode) || normalizedError?.name === 'TypeError' || normalizedError?.name === 'NetworkError')

      if (attempt + 1 >= maxAttempts || !retryableNetworkFailure) throw normalizedError
      await delay(700)
    }
  }

  throw lastError || new Error('Request failed')
}

export async function apiDownload(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase()
  const capability = resolveTrustedCapability(path, method)
  if (isPrivilegedMutation(path, method) && !capability) {
    throw Object.assign(new Error("This operation is not registered in OneEngine Trusted Runtime"), {
      status: 403,
      code: "UNREGISTERED_CAPABILITY",
    })
  }
  const kioskRuntime = typeof window !== "undefined" && /\/kiosk-runtime\/?$/.test(window.location.pathname)
  const kioskDisplay = typeof window !== "undefined" && /\/kiosk-display\/?$/.test(window.location.pathname)
  const kioskToken = kioskRuntime ? (localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY) || "") : ""
  const displayToken = kioskDisplay ? (localStorage.getItem(KIOSK_DISPLAY_TOKEN_STORAGE_KEY) || "") : ""
  const token = kioskToken || displayToken || sessionStorage.getItem("onepos_token") || localStorage.getItem("onepos_token")
  const response = await fetchWithTimeout(apiUrl(path), {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...trustedRuntimeHeaders(capability),
      ...contextHeaders(path, options.headers),
    },
  }, options.timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS)
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const payload = await response.json()
      if (payload?.message) message = payload.message
    } catch {}
    throw new Error(message)
  }
  const disposition = response.headers.get("content-disposition") || ""
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || "report-export"
  return {
    blob: await response.blob(),
    filename,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  }
}


export async function login(username, password) {
  /*
   * A fresh password login must not inherit an old bearer token from a
   * previous mobile/browser session.
   */
  clearCompanyContext()
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  sessionStorage.removeItem('onepos.settings.context.v2')
  sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  sessionStorage.removeItem(AVAILABLE_STORES_STORAGE_KEY)
  void clearLazyCache()
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')

  const attemptLogin = async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      return await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
          deviceToken: localStorage.getItem('onepos_trusted_device_token') || null,
        }),
        signal: controller.signal,
      })
    } finally {
      window.clearTimeout(timeout)
    }
  }

  let data
  try {
    data = await attemptLogin()
  } catch (error) {
    if (error?.name !== 'AbortError' && error?.code !== 'API_TIMEOUT') throw error
    // Render may briefly be unavailable while a new deployment starts.
    await new Promise((resolve) => window.setTimeout(resolve, 1200))
    try {
      data = await attemptLogin()
    } catch (retryError) {
      if (retryError?.name === 'AbortError' || retryError?.code === 'API_TIMEOUT') {
        throw normalizeOneEngineError(retryError, { status: 0 })
      }
      throw normalizeOneEngineError(retryError, { status: retryError?.status || 0, payload: retryError?.payload || null })
    }
  }

  if (!data?.success) throw new Error(data?.message || 'Login failed')
  if (data?.mfaRequired) return data
  if (!data?.token) throw new Error(data?.message || 'Login failed')
  sessionStorage.setItem('onepos_token', data.token)

  let resolvedUser = { ...(data.user || {}), storeId: null }
  const boundCompanyId = resolvedUser?.companyId || resolvedUser?.company_id || ''
  if (boundCompanyId && !resolvedUser?.companyId) {
    resolvedUser = { ...resolvedUser, companyId: boundCompanyId }
  }
  sessionStorage.setItem('onepos_user', JSON.stringify(resolvedUser))
  if (data?.permissions && typeof data.permissions === 'object') {
    setStoredSessionPermissions(data.permissions)
  }

  if (resolvedUser?.companyId) {
    let storeContext
    if (Array.isArray(data?.stores)) {
      const stores = data.stores.filter((store) => !(store.companyId || store.company_id) || String(store.companyId || store.company_id) === String(resolvedUser.companyId))
      sessionStorage.setItem(AVAILABLE_STORES_STORAGE_KEY, JSON.stringify(stores))
      storeContext = resolveActiveStoreFromRows(stores)
    } else {
      storeContext = await ensureActiveStoreContext().catch(() => { setActiveStoreId(''); return { stores: [], activeStoreId: '' } })
    }
    if (storeContext.activeStoreId) {
      resolvedUser = { ...resolvedUser, storeId: storeContext.activeStoreId }
      sessionStorage.setItem('onepos_user', JSON.stringify(resolvedUser))
    }
  } else {
    sessionStorage.removeItem(AVAILABLE_STORES_STORAGE_KEY)
    setActiveStoreId('')
  }

  return { ...data, user: resolvedUser }
}

export async function loadAuthenticationProviders(email) {
  const value = String(email || '').trim()
  if (!value) return []
  const response = await apiRequest(`/api/auth/providers?email=${encodeURIComponent(value)}`)
  return Array.isArray(response?.data) ? response.data : []
}

export function startAuthenticationProvider(provider, email, returnTo = typeof window !== 'undefined' ? window.location.href : '') {
  if (typeof window === 'undefined') return
  const key = String(provider?.key || provider?.providerKey || '').trim()
  const value = String(email || '').trim()
  if (!key || !value) throw new Error('Email and authentication provider are required.')
  const target = returnTo || window.location.href
  const protocol = String(provider?.type || provider?.providerType || '').toUpperCase() === 'SAML' ? 'saml/start' : 'start'
  window.location.assign(apiUrl(`/api/auth/provider/${encodeURIComponent(key)}/${protocol}?email=${encodeURIComponent(value)}&returnTo=${encodeURIComponent(target.split('#')[0])}`))
}

export function consumeAuthenticationProviderCallback() {
  if (typeof window === 'undefined') return { handled: false }
  const raw = String(window.location.hash || '').replace(/^#/, '')
  if (!raw) return { handled: false }
  const params = new URLSearchParams(raw)
  const error = params.get('provider_error')
  const token = params.get('provider_token')
  const mfaChallenge = params.get('provider_mfa_challenge')
  if (!error && !token && !mfaChallenge) return { handled: false }

  window.history.replaceState({}, '', window.location.pathname + window.location.search)
  if (error) {
    const messages = {
      provider_not_available: 'This authentication provider is not available for your account.',
      provider_not_configured: 'This authentication provider is not fully configured.',
      provider_protocol_mismatch: 'The configured authentication protocol does not match this provider.',
      provider_cancelled: 'Authentication was cancelled.',
      invalid_state: 'Authentication could not be verified. Please try again.',
      missing_code: 'The provider did not return an authorization code.',
      token_exchange_failed: 'Authentication token exchange failed.',
      profile_lookup_failed: 'Your profile could not be loaded from the authentication provider.',
      email_not_verified: 'Your email address was not verified by the authentication provider.',
      account_not_linked: 'This external account is not linked to a OneEngine user.',
      saml_invalid: 'The SAML response could not be verified.',
      provider_login_failed: 'Authentication provider sign-in failed.',
    }
    return { handled: true, error: messages[error] || 'Authentication provider sign-in failed.' }
  }
  if (mfaChallenge) {
    return {
      handled: true,
      mfaRequired: true,
      challengeId: mfaChallenge,
      enrollmentRequired: params.get('provider_mfa_enroll') === '1',
      phishingResistantRequired: params.get('provider_mfa_phishing_resistant') === '1',
    }
  }
  clearCompanyContext()
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  sessionStorage.removeItem('onepos.settings.context.v2')
  sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')
  sessionStorage.setItem('onepos_token', token)
  return { handled: true, token }
}

export async function startGoogleLogin(email, returnTo = typeof window !== 'undefined' ? window.location.href : '') {
  if (typeof window === 'undefined') return
  const loginEmail = String(email || '').trim()
  if (!loginEmail) throw new Error('Enter your email first to use Google SSO.')

  const status = await apiRequest(`/api/auth/google/status?email=${encodeURIComponent(loginEmail)}`)
  if (status?.data?.available !== true) {
    throw new Error('SSO not connected. Please login with email/password.')
  }

  const target = returnTo || window.location.href
  window.location.assign(apiUrl(
    `/api/auth/google/start?email=${encodeURIComponent(loginEmail)}&returnTo=${encodeURIComponent(target.split('#')[0])}`
  ))
}

export function consumeGoogleOAuthCallback() {
  if (typeof window === 'undefined') return { handled: false }

  const raw = String(window.location.hash || '').replace(/^#/, '')
  if (!raw) return { handled: false }

  const params = new URLSearchParams(raw)
  const error = params.get('google_error')
  const token = params.get('google_token')
  const mfaChallenge = params.get('google_mfa_challenge')
  const mfaEnroll = params.get('google_mfa_enroll')
  const mfaPhishingResistant = params.get('google_mfa_phishing_resistant')

  if (!error && !token && !mfaChallenge) return { handled: false }

  window.history.replaceState({}, '', window.location.pathname + window.location.search)

  if (error) {
    const messages = {
      google_cancelled: 'Google sign-in was cancelled.',
      account_not_linked: 'This Google account is not linked to a onePOS account.',
      account_disabled: 'This onePOS account is disabled.',
      email_not_verified: 'Your Google email address could not be verified.',
      invalid_state: 'Google sign-in could not be verified. Please try again.',
      missing_code: 'Google did not return a sign-in code. Please try again.',
      token_exchange_failed: 'Google sign-in could not be completed. Please try again.',
      profile_lookup_failed: 'Google account details could not be loaded.',
      google_not_configured: 'SSO not connected. Please login with email/password.',
      sso_not_connected: 'SSO not connected. Please login with email/password.',
      google_login_failed: 'Google Sign-In failed. Please try again.',
    }
    return { handled: true, error: messages[error] || 'Google Sign-In failed. Please try again.' }
  }

  if (mfaChallenge) {
    return {
      handled: true,
      mfaRequired: true,
      challengeId: mfaChallenge,
      enrollmentRequired: mfaEnroll === '1',
      phishingResistantRequired: mfaPhishingResistant === '1',
    }
  }

  clearCompanyContext()
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  sessionStorage.removeItem('onepos.settings.context.v2')
  sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  void clearLazyCache()
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')
  setActingCompanyId('')
  sessionStorage.setItem('onepos_token', token)

  return { handled: true, token }
}


function storeCompletedLogin(data) {
  if (!data?.success || !data?.token) throw new Error(data?.message || 'Verification failed')
  clearCompanyContext()
  sessionStorage.setItem('onepos_token', data.token)
  if (data.user) sessionStorage.setItem('onepos_user', JSON.stringify(data.user))
  return data
}

export async function startTotpEnrollment(challengeId, label = 'Authenticator') {
  return apiRequest('/api/auth/mfa/totp/start', { method: 'POST', body: JSON.stringify({ challengeId, label }) })
}

export async function completeTotpEnrollment({ challengeId, methodId, code, trustDevice = false, deviceName = '' }) {
  const data = await apiRequest('/api/auth/mfa/totp/complete', { method: 'POST', body: JSON.stringify({ challengeId, methodId, code, trustDevice, deviceName }) })
  if (data?.deviceToken) localStorage.setItem('onepos_trusted_device_token', data.deviceToken)
  return storeCompletedLogin(data)
}

export async function verifyMfa({ challengeId, methodId, methodType = 'TOTP', code, trustDevice = false, deviceName = '' }) {
  const data = await apiRequest('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ challengeId, methodId, methodType, code, trustDevice, deviceName }) })
  if (data?.token) {
    if (data?.deviceToken) localStorage.setItem('onepos_trusted_device_token', data.deviceToken)
    return storeCompletedLogin(data)
  }
  return data
}

export async function startPasskeyLogin(identifier) {
  return apiRequest('/api/auth/passkey/login/options', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
    timeoutMs: 10000,
    retryGet: false,
  })
}

export async function verifyPasskeyLogin({ challengeId, credential, trustDevice = false, deviceName = '' }) {
  const data = await apiRequest('/api/auth/passkey/login/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeId, credential, trustDevice, deviceName }),
    timeoutMs: 10000,
    retryGet: false,
  })
  if (data?.token) return storeCompletedLogin(data)
  return data
}

export async function startPasskeyRegistration(challengeId, authenticatorKind = 'PLATFORM') {
  return apiRequest('/api/auth/mfa/passkey/registration-options', { method: 'POST', body: JSON.stringify({ challengeId, authenticatorKind }) })
}

export async function completePasskeyRegistration({ challengeId, credential, label = 'Passkey', trustDevice = false, deviceName = '' }) {
  const data = await apiRequest('/api/auth/mfa/passkey/registration-verify', { method: 'POST', body: JSON.stringify({ challengeId, credential, label, trustDevice, deviceName }) })
  if (data?.deviceToken) localStorage.setItem('onepos_trusted_device_token', data.deviceToken)
  return storeCompletedLogin(data)
}

export async function getPasskeyOptions(challengeId) {
  return apiRequest('/api/auth/mfa/passkey/options', { method: 'POST', body: JSON.stringify({ challengeId }) })
}

export async function verifyPasskey({ challengeId, credential, trustDevice = false, deviceName = '' }) {
  const data = await apiRequest('/api/auth/mfa/passkey/verify', { method: 'POST', body: JSON.stringify({ challengeId, credential, trustDevice, deviceName }) })
  if (data?.token) {
    if (data?.deviceToken) localStorage.setItem('onepos_trusted_device_token', data.deviceToken)
    return storeCompletedLogin(data)
  }
  return data
}

export async function verifyPin(pin) {
  const data = await apiRequest('/api/auth/unlock-pin', {
    method: 'POST',
    body: JSON.stringify({ pin }),
  })
  if (!data?.success) throw new Error(data?.message || 'Unable to unlock')
  return data
}

export function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem('onepos_user') || localStorage.getItem('onepos_user') || '{}')
  } catch {
    return {}
  }
}

export function hasSessionContext() {
  const user = getStoredUser()
  let storesInitialized = false
  try { storesInitialized = sessionStorage.getItem(AVAILABLE_STORES_STORAGE_KEY) !== null } catch {}
  return Boolean(
    user?.id
    && (user?.companyId || user?.company_id || user?.company?.id)
    && getStoredSessionPermissions()
    && storesInitialized
  )
}

let sessionBootstrapInFlight = null
export async function ensureActingCompanyContext({ force = false } = {}) {
  const existingUser = getStoredUser()
  const existingCompanyId = existingUser?.companyId || existingUser?.company_id || existingUser?.company?.id || ''
  if (!force && hasSessionContext()) return existingCompanyId
  if (sessionBootstrapInFlight) return sessionBootstrapInFlight

  // One server round-trip restores identity + stores + effective RBAC. Do not
  // clear usable cached context before the replacement is available: that used
  // to make every refresh/page transition rediscover the same session.
  sessionBootstrapInFlight = apiRequest('/api/auth/bootstrap', { timeoutMs: 5000, retryGet: false })
    .then((bootstrap) => {
      const user = bootstrap?.user || {}
      const companyId = user.companyId || user.company_id || ''
      const stores = companyId && Array.isArray(bootstrap?.stores)
        ? bootstrap.stores.filter((store) => !(store.companyId || store.company_id) || String(store.companyId || store.company_id) === String(companyId))
        : []

      sessionStorage.setItem('onepos_user', JSON.stringify({ ...user, companyId, storeId: null }))
      sessionStorage.setItem(AVAILABLE_STORES_STORAGE_KEY, JSON.stringify(stores))
      if (bootstrap?.permissions && typeof bootstrap.permissions === 'object') {
        setStoredSessionPermissions(bootstrap.permissions)
      }
      const storeContext = resolveActiveStoreFromRows(stores)
      if (storeContext.activeStoreId) {
        sessionStorage.setItem('onepos_user', JSON.stringify({ ...user, companyId, storeId: storeContext.activeStoreId }))
      }
      return companyId
    })
    .finally(() => { sessionBootstrapInFlight = null })

  return sessionBootstrapInFlight
}

export function lockToKioskDisplayMode() {
  clearCompanyContext()
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  sessionStorage.removeItem('onepos.settings.context.v2')
  sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  sessionStorage.removeItem(AVAILABLE_STORES_STORAGE_KEY)
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')
  setActingCompanyId('')
  try { localStorage.removeItem(ACTIVE_STORE_STORAGE_KEY) } catch {}
}

export function lockToKioskMode() {
  // Preserve the dedicated kiosk token and server address only. Remove all
  // staff/browser identity so navigating away from /kiosk-runtime cannot
  // inherit an administrator or cashier session.
  clearCompanyContext()
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  sessionStorage.removeItem('onepos.settings.context.v2')
  sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  sessionStorage.removeItem(AVAILABLE_STORES_STORAGE_KEY)
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')
  setActingCompanyId('')
  try { localStorage.removeItem(ACTIVE_STORE_STORAGE_KEY) } catch {}
}

export function logout() {
  clearCompanyContext()
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  sessionStorage.removeItem('onepos.settings.context.v2')
  sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  void clearLazyCache()
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')
  setActingCompanyId('')
  setActiveStoreId('')
}

export function hasSession() {
  return Boolean(sessionStorage.getItem('onepos_token'))
}

export async function checkBackend() {
  return apiRequest('/api/health')
}

export const API_BASE = DEFAULT_API_BASE
