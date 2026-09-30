import { clearLazyCache } from './dataCache'
import { isPrivilegedMutation, resolveTrustedCapability, validateTrustedRuntime } from './trustedRuntime'
export const TRUSTED_RUNTIME_STATE = validateTrustedRuntime()

const DEFAULT_API_BASE = String(import.meta.env.VITE_API_BASE || 'https://onepos.onrender.com').replace(/\/$/, '')
export const SERVER_ADDRESS_STORAGE_KEY = 'onepos_server_address'
export const ACTING_COMPANY_STORAGE_KEY = 'onepos_acting_company_id'
export const SESSION_PERMISSIONS_STORAGE_KEY = 'onepos_session_permissions'

export function getActingCompanyId() {
  try { return localStorage.getItem(ACTING_COMPANY_STORAGE_KEY) || '' } catch { return '' }
}

export function setActingCompanyId(companyId) {
  try {
    if (companyId) localStorage.setItem(ACTING_COMPANY_STORAGE_KEY, String(companyId))
    else localStorage.removeItem(ACTING_COMPANY_STORAGE_KEY)
  } catch {}
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
      ...(options.headers || {}),
    },
  })
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
  const token = sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(getActingCompanyId() ? { 'X-Acting-Company-Id': getActingCompanyId() } : {}),
      ...(capability ? {
        'X-OneEngine-Capability': capability.id,
        'X-OneEngine-Runtime': TRUSTED_RUNTIME_STATE.version,
      } : {}),
      ...(options.headers || {}),
    },
  })

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
    if (error?.name !== 'AbortError') throw error
    // Render may briefly be unavailable while a new deployment starts.
    await new Promise((resolve) => window.setTimeout(resolve, 1200))
    try {
      data = await attemptLogin()
    } catch (retryError) {
      if (retryError?.name === 'AbortError') {
        throw new Error('Server is starting. Please try again in a few seconds.')
      }
      throw retryError
    }
  }

  if (!data?.success || !data?.token) throw new Error(data?.message || 'Login failed')
  sessionStorage.setItem('onepos_token', data.token)

  let resolvedUser = data.user || {}
  if (resolvedUser?.isPlatformDeveloper === true) {
    /*
     * The login endpoint validates and resolves the optional acting company in
     * the same request. Do not block sign-in with follow-up company discovery
     * and validation HTTP calls.
     */
    const companyId = String(data?.actingCompanyId || '')
    setActingCompanyId(companyId)
    if (companyId) resolvedUser = { ...resolvedUser, companyId }
  } else {
    // Tenant logins must never inherit a previous developer company context.
    setActingCompanyId('')
  }

  sessionStorage.setItem('onepos_user', JSON.stringify(resolvedUser))
  if (data?.permissions && typeof data.permissions === 'object') {
    setStoredSessionPermissions(data.permissions)
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
  // Only global developer profiles with no company binding need acting-company
  // discovery. This keeps normal tenant developer pages on the login company.
  if (user?.companyId) {
    setActingCompanyId(String(user.companyId))
    return user.companyId
  }

  const rememberedCompanyId = getActingCompanyId()
  try {
    const permissionState = await loadSessionPermissions({ includeEntitlements: false })
    const permissionCodes = Array.isArray(permissionState?.permissions)
      ? permissionState.permissions
      : []
    const canActForCompany = permissionCodes.includes('platform.manage') || user?.isPlatformDeveloper === true

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
