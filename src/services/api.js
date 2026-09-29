const DEFAULT_API_BASE = String(import.meta.env.VITE_API_BASE || 'https://onepos.onrender.com').replace(/\/$/, '')
export const SERVER_ADDRESS_STORAGE_KEY = 'onepos_server_address'
export const ACTING_COMPANY_STORAGE_KEY = 'onepos_acting_company_id'

export function getActingCompanyId() {
  try { return localStorage.getItem(ACTING_COMPANY_STORAGE_KEY) || '' } catch { return '' }
}

export function setActingCompanyId(companyId) {
  try {
    if (companyId) localStorage.setItem(ACTING_COMPANY_STORAGE_KEY, String(companyId))
    else localStorage.removeItem(ACTING_COMPANY_STORAGE_KEY)
  } catch {}
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
  const token = sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(getActingCompanyId() ? { 'X-Acting-Company-Id': getActingCompanyId() } : {}),
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
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')

  const attemptLogin = async () => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    try {
      return await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
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
     * Smart Theme is a separate frontend from the legacy onePOS shell, so it
     * must hydrate the same authorised acting-company context after login.
     * Without this, a mapped Platform Developer/Superadmin reaches Settings
     * with no X-Acting-Company-Id and every tenant-backed page appears empty.
     */
    const rememberedCompanyId = getActingCompanyId()
    setActingCompanyId('')
    try {
      const companiesResponse = await apiRequest('/api/platform/developer/companies')
      const companies = Array.isArray(companiesResponse?.data) ? companiesResponse.data : []
      const companyId = companies.some((company) => String(company.id) === String(rememberedCompanyId))
        ? rememberedCompanyId
        : companies.length === 1
          ? companies[0].id
          : ''

      if (companyId) {
        await apiRequest('/api/platform/developer/acting-company', {
          method: 'PUT',
          body: JSON.stringify({ actingCompanyId: companyId }),
        })
        setActingCompanyId(companyId)
        resolvedUser = { ...resolvedUser, companyId }
      }
    } catch {
      setActingCompanyId('')
    }
  } else {
    // Tenant logins must never inherit a previous developer company context.
    setActingCompanyId('')
  }

  sessionStorage.setItem('onepos_user', JSON.stringify(resolvedUser))
  return { ...data, user: resolvedUser }
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

export function logout() {
  sessionStorage.removeItem('onepos_token')
  sessionStorage.removeItem('onepos_user')
  localStorage.removeItem('onepos_token')
  localStorage.removeItem('onepos_user')
}

export function hasSession() {
  return Boolean(sessionStorage.getItem('onepos_token'))
}

export async function checkBackend() {
  return apiRequest('/api/health')
}

export const API_BASE = DEFAULT_API_BASE
