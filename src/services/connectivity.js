import { apiUrl } from './api'

export const INTERNET_STATES = Object.freeze({ CONNECTED: 'connected', DISCONNECTED: 'disconnected', UNKNOWN: 'unknown' })
export const SERVER_STATES = Object.freeze({ CONNECTED: 'connected', UNREACHABLE: 'unreachable', UNKNOWN: 'unknown' })
export const DB_STATES = Object.freeze({ CONNECTED: 'connected', UNAVAILABLE: 'unavailable', UNKNOWN: 'unknown' })

const state = {
  internet: typeof navigator !== 'undefined' && navigator.onLine === false ? INTERNET_STATES.DISCONNECTED : INTERNET_STATES.UNKNOWN,
  server: SERVER_STATES.UNKNOWN,
  database: DB_STATES.UNKNOWN,
  checking: false,
  lastError: null,
  lastServerOkAt: null,
}
const listeners = new Set()
let timer = null
let inFlight = null

function notify() {
  const snapshot = { ...state }
  for (const listener of listeners) {
    try { listener(snapshot) } catch {}
  }
}
export function getConnectivity() { return { ...state } }
export function subscribeConnectivity(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function checkConnectivity() {
  if (inFlight) return inFlight
  state.checking = true
  notify()
  inFlight = (async () => {
    try {
      const response = await fetch(apiUrl('/api/health'), { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw Object.assign(new Error(`Server responded HTTP ${response.status}`), { serverReached: true })
      state.internet = INTERNET_STATES.CONNECTED
      state.server = SERVER_STATES.CONNECTED
      state.lastServerOkAt = new Date().toISOString()
      state.lastError = null
      try {
        const body = await response.json()
        state.database = body?.database === 'connected' ? DB_STATES.CONNECTED
          : ['error','not configured'].includes(body?.database) ? DB_STATES.UNAVAILABLE : DB_STATES.UNKNOWN
      } catch {
        state.database = DB_STATES.UNKNOWN
      }
    } catch (error) {
      if (error?.serverReached) {
        state.internet = INTERNET_STATES.CONNECTED
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        state.internet = INTERNET_STATES.DISCONNECTED
      }
      state.server = SERVER_STATES.UNREACHABLE
      state.database = DB_STATES.UNKNOWN
      state.lastError = error?.message || 'Server unreachable'
    } finally {
      state.checking = false
      inFlight = null
      notify()
    }
    return getConnectivity()
  })()
  return inFlight
}

function onOnline() {
  state.internet = INTERNET_STATES.CONNECTED
  notify()
  void checkConnectivity()
}
function onOffline() {
  state.internet = INTERNET_STATES.DISCONNECTED
  state.server = SERVER_STATES.UNREACHABLE
  state.database = DB_STATES.UNKNOWN
  state.lastError = 'Internet unavailable'
  notify()
}

export function startConnectivityMonitoring({ intervalMs = 30000 } = {}) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  if (timer) window.clearInterval(timer)
  if (intervalMs > 0) timer = window.setInterval(() => void checkConnectivity(), intervalMs)
  void checkConnectivity()
  return stopConnectivityMonitoring
}
export function stopConnectivityMonitoring() {
  if (typeof window === 'undefined') return
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  if (timer) window.clearInterval(timer)
  timer = null
}
