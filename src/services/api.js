const API_BASE = String(import.meta.env.VITE_API_BASE || 'https://onepos.onrender.com').replace(/\/$/, '')

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export async function apiRequest(path, options = {}) {
  const token = sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const data = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  if (!data?.success || !data?.token) throw new Error(data?.message || 'Login failed')
  sessionStorage.setItem('onepos_token', data.token)
  sessionStorage.setItem('onepos_user', JSON.stringify(data.user || {}))
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

export { API_BASE }
