const DB_NAME = 'onepos_lazy_data_cache'
const DB_VERSION = 1
const STORE = 'responses'

export const LAZY_CACHE_DEFAULT_TTL_MS = 2 * 60 * 1000
export const LAZY_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1000
export const LAZY_CACHE_MAX_BYTES = 20 * 1024 * 1024
export const LAZY_CACHE_MAX_ENTRIES = 200

function token() {
  try { return sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token') || '' } catch { return '' }
}

function tokenPayload() {
  try {
    const part = String(token()).split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function currentScope() {
  const payload = tokenPayload() || {}
  let actingCompanyId = ''
  try { actingCompanyId = localStorage.getItem('onepos_acting_company_id') || '' } catch {}
  const companyId = payload.companyId || actingCompanyId || ''
  const userId = payload.id || payload.userId || ''
  return userId && companyId ? { userId: String(userId), companyId: String(companyId) } : null
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('scopeSaved', ['scope', 'savedAt'])
        store.createIndex('savedAt', 'savedAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function cryptoKey() {
  const raw = token()
  if (!raw || !globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encrypt(value) {
  const key = await cryptoKey()
  if (!key) return null
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
    bytes: bytes.byteLength,
  }
}

async function decrypt(record) {
  const key = await cryptoKey()
  if (!key || !record?.iv || !record?.data) return null
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
      key,
      new Uint8Array(record.data),
    )
    return JSON.parse(new TextDecoder().decode(decrypted))
  } catch {
    return null
  }
}

function keyFor(scope, cacheKey) {
  return `${scope.userId}:${scope.companyId}:${cacheKey}`
}

export async function readLazyCache(cacheKey) {
  const scope = currentScope()
  if (!scope || !cacheKey) return null
  try {
    const db = await openDb()
    if (!db) return null
    const row = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(keyFor(scope, cacheKey))
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
    if (!row || row.scope !== `${scope.userId}:${scope.companyId}`) return null
    const value = await decrypt(row)
    if (value == null) return null
    return { value, savedAt: Number(row.savedAt || 0), bytes: Number(row.bytes || 0) }
  } catch {
    return null
  }
}

export async function writeLazyCache(cacheKey, value) {
  const scope = currentScope()
  if (!scope || !cacheKey || value == null) return false
  try {
    const sealed = await encrypt(value)
    if (!sealed || sealed.bytes > LAZY_CACHE_MAX_BYTES / 2) return false
    const db = await openDb()
    if (!db) return false
    const row = {
      key: keyFor(scope, cacheKey),
      scope: `${scope.userId}:${scope.companyId}`,
      savedAt: Date.now(),
      bytes: sealed.bytes,
      iv: sealed.iv,
      data: sealed.data,
    }
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(row)
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
    })
    scheduleCleanup()
    return true
  } catch {
    return false
  }
}

let cleanupScheduled = false
function scheduleCleanup() {
  if (cleanupScheduled) return
  cleanupScheduled = true
  const run = () => {
    cleanupScheduled = false
    void cleanupLazyCache()
  }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 })
  else setTimeout(run, 250)
}

export async function cleanupLazyCache() {
  const scope = currentScope()
  try {
    const db = await openDb()
    if (!db) return
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
    const now = Date.now()
    const activeScope = scope ? `${scope.userId}:${scope.companyId}` : ''
    const scoped = rows
      .filter((row) => row.scope === activeScope)
      .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))

    let bytes = 0
    const remove = new Set()
    scoped.forEach((row, index) => {
      const expired = now - Number(row.savedAt || 0) > LAZY_CACHE_MAX_STALE_MS
      const overCount = index >= LAZY_CACHE_MAX_ENTRIES
      const nextBytes = bytes + Number(row.bytes || 0)
      const overBytes = nextBytes > LAZY_CACHE_MAX_BYTES
      if (expired || overCount || overBytes) remove.add(row.key)
      else bytes = nextBytes
    })

    if (!remove.size) return
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      for (const key of remove) store.delete(key)
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } catch {}
}

export async function clearLazyCache() {
  try {
    const db = await openDb()
    if (!db) return
    await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readwrite').objectStore(STORE).clear()
      request.onsuccess = resolve
      request.onerror = () => reject(request.error)
    })
  } catch {}
}
