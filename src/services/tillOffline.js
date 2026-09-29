const DB_NAME = 'onepos_smart_theme_offline'
const DB_VERSION = 1
const STORE = 'sales'

function tokenPayload() {
  try {
    const token = sessionStorage.getItem('onepos_token') || localStorage.getItem('onepos_token')
    const part = String(token || '').split('.')[1]
    if (!part) return null
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function currentTenant() {
  const payload = tokenPayload()
  if (!payload?.companyId || !payload?.storeId) return null
  return { companyId: payload.companyId, storeId: payload.storeId, userId: payload.id || null }
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('tenantCreated', ['companyId', 'storeId', 'createdAt'])
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transaction(mode, work) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result
    try { result = work(store) } catch (error) { reject(error); return }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Offline transaction aborted'))
  }))
}

export async function enqueueOfflineCashSale(payload, terminalNumber = 'T') {
  const tenant = currentTenant()
  if (!tenant) throw new Error('A signed-in tenant is required for offline sales')
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const seqKey = `onepos_smart_offline_seq_${tenant.companyId}_${tenant.storeId}_${terminalNumber}_${date}`
  const next = Number(localStorage.getItem(seqKey) || 0) + 1
  localStorage.setItem(seqKey, String(next))
  const provisionalReceipt = `${terminalNumber || 'T'}-${date}-${String(next).padStart(4, '0')}`
  const entry = {
    id: payload.clientRequestId,
    companyId: tenant.companyId,
    storeId: tenant.storeId,
    createdAt: now.toISOString(),
    status: 'pending',
    attempts: 0,
    payload,
    provisionalReceipt,
    lastError: null,
  }
  await transaction('readwrite', (store) => store.put(entry))
  return entry
}

export async function removeOfflineCashSale(id) {
  if (!id) return
  await transaction('readwrite', (store) => store.delete(id))
}

export async function failOfflineCashSale(id, message = 'Server rejected sale') {
  if (!id) return
  const rows = await offlineQueueEntries()
  const current = rows.find((entry) => entry.id === id)
  if (!current) return
  await transaction('readwrite', (store) => store.put({
    ...current,
    status: 'failed',
    attempts: Number(current.attempts || 0) + 1,
    lastError: String(message || 'Server rejected sale'),
  }))
}

export async function offlineQueueEntries() {
  const tenant = currentTenant()
  if (!tenant) return []
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result || []).filter((entry) => entry.companyId === tenant.companyId && entry.storeId === tenant.storeId).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))))
    request.onerror = () => reject(request.error)
  })
}

export async function syncOfflineCashSales(apiRequest) {
  const rows = await offlineQueueEntries()
  let synced = 0
  for (const entry of rows) {
    if (entry.status === 'failed') continue
    try {
      const response = await apiRequest('/api/sales', { method: 'POST', body: JSON.stringify(entry.payload) })
      if (!response?.success || !response?.sale?.id) throw Object.assign(new Error(response?.message || 'Unconfirmed sale response'), { serverResponse: true })
      await transaction('readwrite', (store) => store.delete(entry.id))
      synced += 1
    } catch (error) {
      if (error instanceof TypeError || !navigator.onLine) break
      const next = { ...entry, status: 'failed', attempts: Number(entry.attempts || 0) + 1, lastError: error?.message || 'Server rejected sale' }
      await transaction('readwrite', (store) => store.put(next))
    }
  }
  return { synced, remaining: (await offlineQueueEntries()).length }
}

export function cacheProductModifiers(productId, rows) {
  const tenant = currentTenant()
  if (!tenant || !productId) return
  try {
    localStorage.setItem(
      `onepos_smart_modifiers_${tenant.companyId}_${tenant.storeId}_${productId}`,
      JSON.stringify({ savedAt: Date.now(), rows: Array.isArray(rows) ? rows : [] }),
    )
  } catch {}
}

export function loadProductModifiers(productId) {
  const tenant = currentTenant()
  if (!tenant || !productId) return null
  try {
    const value = JSON.parse(localStorage.getItem(`onepos_smart_modifiers_${tenant.companyId}_${tenant.storeId}_${productId}`) || 'null')
    return Array.isArray(value?.rows) ? value.rows : null
  } catch {
    return null
  }
}

export function cacheTillBootstrap(value) {
  const tenant = currentTenant()
  if (!tenant) return
  try { localStorage.setItem(`onepos_smart_till_cache_${tenant.companyId}_${tenant.storeId}`, JSON.stringify({ savedAt: Date.now(), value })) } catch {}
}

export function loadTillBootstrapCache() {
  const tenant = currentTenant()
  if (!tenant) return null
  try {
    const row = JSON.parse(localStorage.getItem(`onepos_smart_till_cache_${tenant.companyId}_${tenant.storeId}`) || 'null')
    return row?.value || null
  } catch { return null }
}
