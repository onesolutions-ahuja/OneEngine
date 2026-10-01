import { clearLazyCache } from './dataCache'
import { isPrivilegedMutation, resolveTrustedCapability, trustedRuntimeHeaders, validateTrustedRuntime } from './trustedRuntime'
export const TRUSTED_RUNTIME_STATE = validateTrustedRuntime()

const DEFAULT_API_BASE = String(import.meta.env.VITE_API_BASE || 'https://onepos.onrender.com').replace(/\/$/, '')
export const SERVER_ADDRESS_STORAGE_KEY = 'onepos_server_address'
export const ACTING_COMPANY_STORAGE_KEY = 'onepos_acting_company_id'
export const SESSION_PERMISSIONS_STORAGE_KEY = 'onepos_session_permissions'
export const ACTIVE_STORE_STORAGE_KEY = 'onepos_active_store_id'
export const AVAILABLE_STORES_STORAGE_KEY = 'onepos_available_stores'

export function getActingCompanyId() {
  try { return localStorage.getItem(ACTING_COMPANY_STORAGE_KEY) || '' } catch { return '' }
}

export function setActingCompanyId(companyId) {
  try {
    if (companyId) localStorage.setItem(ACTING_COMPANY_STORAGE_KEY, String(companyId))
    else localStorage.removeItem(ACTING_COMPANY_STORAGE_KEY)
  } catch {}
}

export function getActiveStoreId() {
  try { return localStorage.getItem(ACTIVE_STORE_STORAGE_KEY) || '' } catch { return '' }
}

export function setActiveStoreId(storeId) {
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

export async function ensureActiveStoreContext() {
  const response = await apiRequest('/api/auth/me/stores', { timeoutMs: 12000, retryGet: true })
  const stores = Array.isArray(response?.data) ? response.data : []
  sessionStorage.setItem(AVAILABLE_STORES_STORAGE_KEY, JSON.stringify(stores))

  const remembered = getActiveStoreId()
  const rememberedAllowed = stores.some((store) => String(store.id) === String(remembered))
  const primary = stores.find((store) => store.is_primary === true)
  const selected = rememberedAllowed
    ? remembered
    : stores.length === 1
      ? stores[0].id
      : primary?.id || ''

  setActiveStoreId(selected || '')
  return { stores, activeStoreId: selected || '' }
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

let permissionsInFlight = null
export async function loadSessionPermissions({ force = false, includeEntitlements = false } = {}) {
  if (!force) {
    const cached = getStoredSessionPermissions()
    if (cached) return cached
  }
  if (permissionsInFlight) return permissionsInFlight
  const suffix = includeEntitlements ? '' : '?includeEntitlements=0'
  permissionsInFlight = apiRequest(`/api/auth/me/permissions${suffix}`)
    .then((response) => {
      const data = response?.data || {}
      setStoredSessionPermissions(data)
      return data
    })
    .finally(() => { permissionsInFlight = null })
  return permissionsInFlight
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

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  if (isPrivilegedMutation(path, method)) {
    throw Object.assign(new Error('Privileged mutations must use the OneEngine Trusted Runtime API gate'), {
      status: 403,
      code: 'TRUSTED_RUNTIME_REQUIRED',
    })
  }
  const token = sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
  return fetch(apiUrl(path), {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(getActingCompanyId() ? { 'X-Acting-Company-Id': getActingCompanyId() } : {}),
      ...(getActiveStoreId() ? { 'X-Store-Id': getActiveStoreId() } : {}),
      ...(options.headers || {}),
    },
  })
}

const DEFAULT_REQUEST_TIMEOUT_MS = 12000
const SAFE_GET_RETRY_STATUSES = new Set([429, 502, 503, 504])

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

export async function apiRequest(path, options = {}) {
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
    ...fetchOptions
  } = options
  const token = sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
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
          ...(getActingCompanyId() ? { 'X-Acting-Company-Id': getActingCompanyId() } : {}),
          ...trustedRuntimeHeaders(capability),
          ...(fetchOptions.headers || {}),
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
        throw Object.assign(new Error(message), {
          status: response.status,
          code: typeof body === 'object' ? body?.code : undefined,
          payload: body,
        })
      }

      return body
    } catch (error) {
      lastError = error
      const externalAbort = fetchOptions.signal?.aborted === true
      const retryableNetworkFailure =
        !externalAbort &&
        (error?.code === 'API_TIMEOUT' || error?.name === 'TypeError' || error?.name === 'NetworkError')

      if (attempt + 1 >= maxAttempts || !retryableNetworkFailure) throw error
      await delay(700)
    }
  }

  throw lastError || new Error('Request failed')
}

export async function login(username, password) {
  /*
   * A fresh password login must not inherit an old bearer token from a
   * previous mobile/browser session.
   */
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
          actingCompanyId: getActingCompanyId() || null,
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
        throw new Error('Server is starting. Please try again in a few seconds.')
      }
      throw retryError
    }
  }

  if (!data?.success || !data?.token) throw new Error(data?.message || 'Login failed')
  sessionStorage.setItem('onepos_token', data.token)

  let resolvedUser = data.user || {}
  const boundCompanyId = resolvedUser?.companyId || resolvedUser?.company_id || ''
  if (boundCompanyId && !resolvedUser?.companyId) {
    resolvedUser = { ...resolvedUser, companyId: boundCompanyId }
  }
  const actingCompanyId = String(data?.actingCompanyId || '')
  if (actingCompanyId) {
    setActingCompanyId(actingCompanyId)
    resolvedUser = { ...resolvedUser, companyId: actingCompanyId }
  } else if (boundCompanyId) {
    setActingCompanyId(String(boundCompanyId))
  } else {
    // Global OneEngine identities may need an explicit tenant selection.
    setActingCompanyId('')
  }

  sessionStorage.setItem('onepos_user', JSON.stringify(resolvedUser))
  if (data?.permissions && typeof data.permissions === 'object') {
    setStoredSessionPermissions(data.permissions)
  }

  if (resolvedUser?.companyId) {
    const storeContext = await ensureActiveStoreContext().catch(() => ({ stores: [], activeStoreId: '' }))
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

  if (!error && !token) return { handled: false }

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

export async function ensureActingCompanyContext() {
  let user = getStoredUser()

  // OAuth callbacks intentionally carry only the bearer token. Hydrate the
  // canonical session user before resolving tenant/company context so Google
  // login, password login and browser refresh all enter the same bootstrap.
  if (!user?.id) {
    const me = await apiRequest('/api/auth/me')
    user = me?.user || {}
    if (user?.id) sessionStorage.setItem('onepos_user', JSON.stringify(user))
  }

  // Any authenticated company binding is authoritative for this session.
  // Accept both camelCase and database-style snake_case payloads so a refresh,
  // password login and OAuth login all restore the same tenant context.
  const boundCompanyId = user?.companyId || user?.company_id || ''
  if (boundCompanyId) {
    setActingCompanyId(String(boundCompanyId))
    if (!user?.companyId) {
      user = { ...user, companyId: boundCompanyId }
      sessionStorage.setItem('onepos_user', JSON.stringify(user))
    }
    await ensureActiveStoreContext().catch(() => null)
    return boundCompanyId
  }

  const rememberedCompanyId = getActingCompanyId()
  try {
    const permissionState = await loadSessionPermissions({ includeEntitlements: false })
    const permissionCodes = Array.isArray(permissionState?.permissions)
      ? permissionState.permissions
      : []
    const canActForCompany =
      permissionCodes.includes('oneengine.manage')
      || permissionCodes.includes('platform.manage') // legacy compatibility
      || user?.isPlatformDeveloper === true

    if (!canActForCompany) return rememberedCompanyId || ''

    setActingCompanyId('')
    const companiesResponse = await apiRequest('/api/platform/developer/companies')
    const companies = Array.isArray(companiesResponse?.data) ? companiesResponse.data : []
    const companyId = companies.some((company) => String(company.id) === String(rememberedCompanyId))
      ? rememberedCompanyId
      : companies.length === 1
        ? companies[0].id
        : ''

    if (!companyId) return ''

    await apiRequest('/api/platform/developer/acting-company', {
      method: 'PUT',
      body: JSON.stringify({ actingCompanyId: companyId }),
    })
    setActingCompanyId(companyId)
    const resolvedUser = { ...user, companyId }
    sessionStorage.setItem('onepos_user', JSON.stringify(resolvedUser))
    await ensureActiveStoreContext().catch(() => null)
    return companyId
  } catch (error) {
    setActingCompanyId('')
    throw error
  }
}

export function logout() {
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  sessionStorage.removeItem('onepos.settings.context.v2')
  sessionStorage.removeItem(SESSION_PERMISSIONS_STORAGE_KEY)
  void clearLazyCache()
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')
  setActingCompanyId('')
}

export function hasSession() {
  return Boolean(sessionStorage.getItem('onepos_token'))
}

export async function checkBackend() {
  return apiRequest('/api/health')
}

export const API_BASE = DEFAULT_API_BASE
