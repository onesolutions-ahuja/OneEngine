import { apiUrl, diagnoseClientNetworkFailure } from './api'

export const INTERNET_STATES = Object.freeze({ CONNECTED: 'connected', DISCONNECTED: 'disconnected', UNKNOWN: 'unknown' })
export const SERVER_STATES = Object.freeze({ CONNECTED: 'connected', UNREACHABLE: 'unreachable', UNKNOWN: 'unknown' })
export const DB_STATES = Object.freeze({ CONNECTED: 'connected', UNAVAILABLE: 'unavailable', UNKNOWN: 'unknown' })

const state = {
  internet: typeof navigator !== 'undefined' && navigator.onLine === false ? INTERNET_STATES.DISCONNECTED : INTERNET_STATES.UNKNOWN,
  server: SERVER_STATES.UNKNOWN,
  database: DB_STATES.UNKNOWN,
  checking: false,
  lastError: null,
  oeCode: null,
  lastServerOkAt: null,
  lastDiagnostic: null,
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
      let body = null
      try { body = await response.json() } catch {}
      state.internet = INTERNET_STATES.CONNECTED
      state.server = SERVER_STATES.CONNECTED
      state.lastServerOkAt = new Date().toISOString()
      state.database = body?.database === 'connected' ? DB_STATES.CONNECTED
        : ['error','not configured'].includes(body?.database) ? DB_STATES.UNAVAILABLE : DB_STATES.UNKNOWN
      state.oeCode = body?.oeCode || body?.code || null
      state.lastError = response.ok ? null : (body?.message || `Server responded HTTP ${response.status}`)
      if (!response.ok) return
    } catch (error) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        state.internet = INTERNET_STATES.DISCONNECTED
        state.oeCode = 'OEND01'
      } else {
        const diagnostic = await diagnoseClientNetworkFailure('/api/health', { method: 'GET', error })
        state.oeCode = diagnostic.code
        state.lastDiagnostic = diagnostic
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
  state.oeCode = 'OEND01'
  notify()
}

function onVisibilityChange() {
  // Hidden tabs must not keep a sleeping/free database active. When the user
  // returns, perform one immediate check instead of polling in the background.
  if (document.visibilityState === 'visible') void checkConnectivity()
}

export function startConnectivityMonitoring({ intervalMs = 120000 } = {}) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (timer) window.clearInterval(timer)
  if (intervalMs > 0) {
    timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void checkConnectivity()
    }, intervalMs)
  }
  if (document.visibilityState === 'visible') void checkConnectivity()
  return stopConnectivityMonitoring
}
export function stopConnectivityMonitoring() {
  if (typeof window === 'undefined') return
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (timer) window.clearInterval(timer)
  timer = null
}
