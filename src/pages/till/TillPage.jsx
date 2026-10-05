import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArchiveRestore, BadgePoundSterling, Banknote, CreditCard, FileText, HandCoins,
  Minus, Pause, Pencil, Plus, Printer, QrCode, ReceiptText, Search, Settings2,
  ShoppingBag, Tag, UserRound, X, Layers, Landmark, Wallet, Monitor, RefreshCw, ArrowLeftRight,
} from 'lucide-react'
import { apiRequest, getStoredUser, loadSessionPermissions } from '../../services/api'
import { DB_STATES, SERVER_STATES, startConnectivityMonitoring, subscribeConnectivity } from '../../services/connectivity'
import {
  cacheProductModifiers, cacheTillBootstrap, enqueueOfflineCashSale, failOfflineCashSale,
  getOfflineSyncStats, loadProductModifiers, loadTillBootstrapCache, offlineQueueEntries, removeOfflineCashSale,
  retryAllOfflineCashSales, retryOfflineCashSale, syncOfflineCashSales,
} from '../../services/tillOffline'

const ICONS = {
  'archive-open': ArchiveRestore,
  'badge-pound-sterling': BadgePoundSterling,
  banknote: Banknote,
  'credit-card': CreditCard,
  'file-text': FileText,
  'hand-coins': HandCoins,
  minus: Minus,
  pause: Pause,
  pencil: Pencil,
  plus: Plus,
  printer: Printer,
  'qr-code': QrCode,
  'shopping-bag': ShoppingBag,
  layers: Layers,
  tag: Tag,
  'user-round': UserRound,
  monitor: Monitor,
  'refresh-cw': RefreshCw,
  'arrow-left-right': ArrowLeftRight,
  x: X,
}

function money(value, currency = 'GBP') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0))
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`
  }
}

function mergeCatalogueResponse(cachedCatalogue, incomingCatalogue) {
  const cachedPayload = cachedCatalogue?.data || cachedCatalogue || {}
  const incomingPayload = incomingCatalogue?.data || incomingCatalogue || {}
  if (incomingPayload.full !== false || !Array.isArray(cachedPayload.products)) return incomingCatalogue
  const byId = new Map(cachedPayload.products.map((row) => [String(row.id), row]))
  for (const row of incomingPayload.products || []) {
    if (!row?.id) continue
    if (row.deleted === true || row.active === false && row.tombstone === true) byId.delete(String(row.id))
    else byId.set(String(row.id), { ...(byId.get(String(row.id)) || {}), ...row })
  }
  const merged = {
    ...cachedPayload,
    ...incomingPayload,
    products: [...byId.values()],
    categories: Array.isArray(incomingPayload.categories) && incomingPayload.categories.length ? incomingPayload.categories : cachedPayload.categories || [],
    full: true,
  }
  return incomingCatalogue?.data ? { ...incomingCatalogue, data: merged } : merged
}

function normaliseProduct(product) {
  return {
    id: product.id,
    name: product.name || product.product_name || 'Unnamed Product',
    sku: product.sku || product.code || '',
    barcode: product.barcode || product.ean || '',
    price: Number(product.price ?? product.selling_price ?? product.unit_price ?? 0),
    vatRate: Number(product.vat_rate ?? product.vatRate ?? 0),
    vatApplicable: product.vat_applicable !== undefined ? product.vat_applicable !== false : product.vatApplicable !== false,
    ageRestricted: product.age_restricted === true || product.ageRestricted === true,
    trackStock: product.track_stock !== false && product.trackStock !== false,
    imageUrl: product.image_url || product.imageUrl || '',
    category: product.category || product.category_name || 'Other',
    stock: Number(product.stock_quantity ?? product.stock ?? product.quantity ?? 0),
    active: product.active !== false && product.is_active !== false,
  }
}

function ProductImage({ src }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  if (!src || failed) return <ShoppingBag size={24}/>
  return <img src={src} alt="" onError={() => setFailed(true)} />
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="till-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className={`till-modal ${wide ? 'is-wide' : ''}`}>
        <header><strong>{title}</strong><button type="button" onClick={onClose}><X size={15}/></button></header>
        <div className="till-modal-body">{children}</div>
      </section>
    </div>
  )
}

function MetaButton({ button, onAction, disabled = false, className = '' }) {
  const Icon = ICONS[button?.icon] || ShoppingBag
  return <button type="button" className={className} disabled={disabled} onClick={() => onAction(button?.config?.uiAction || button?.config?.ui_action || button?.action_key || button?.target_key || button?.button_key, null, button)}><Icon size={15}/>{button?.label}</button>
}

function buttonMap(buttons) {
  return Object.fromEntries((buttons || []).map((button) => [button?.config?.uiAction || button?.config?.ui_action || button?.action_key, button]))
}

export default function TillPage({ onOpenSettings, onNavigate }) {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState(['All'])
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [basket, setBasket] = useState([])
  const [miscLines, setMiscLines] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [discount, setDiscount] = useState({ type: null, value: 0 })
  const [settings, setSettings] = useState(null)
  const [buttons, setButtons] = useState([])
  const [till, setTill] = useState(null)
  const [tillStatusResolved, setTillStatusResolved] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState([])
  const [liveCredit, setLiveCredit] = useState(null)
  const billChannelRef = useRef(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [heldSales, setHeldSales] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customers, setCustomers] = useState([])
  const [cashReceived, setCashReceived] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastSale, setLastSale] = useState(null)
  const [ageVerified, setAgeVerified] = useState(false)
  const [pendingPayment, setPendingPayment] = useState(null)
  const [receiptQr, setReceiptQr] = useState(null)
  const [priceTarget, setPriceTarget] = useState(null)
  const [modifierPicker, setModifierPicker] = useState(null)
  const [negativeStockNotice, setNegativeStockNotice] = useState(null)
  const [pendingSaleRequest, setPendingSaleRequest] = useState(null)
  const [offlineCount, setOfflineCount] = useState(0)
  const [offlineEntries, setOfflineEntries] = useState([])
  const [offlineStats, setOfflineStats] = useState({ syncedTotal: 0, lastSyncedAt: null, lastError: null })
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [connectivity, setConnectivity] = useState({ server: 'unknown', database: 'unknown', internet: navigator.onLine === false ? 'disconnected' : 'unknown' })
  const [permissions, setPermissions] = useState([])
  const [onlineOrderCount, setOnlineOrderCount] = useState(0)
  const [onlineOrderToast, setOnlineOrderToast] = useState('')
  const [saleCompleteNotice, setSaleCompleteNotice] = useState(null)

  const currency = settings?.company?.currency || 'GBP'
  const meta = useMemo(() => buttonMap(buttons), [buttons])

  const loadTill = async () => {
    setTillStatusResolved(false)
    try {
      const response = await apiRequest('/api/platform/objects/till_session/records?page=1&pageSize=100')
      const rows = Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : []
      const open = rows.find((row) => String(row?.status || '').toLowerCase() === 'open') || null
      setTill(open)
    } catch {
      setTill(null)
    } finally {
      setTillStatusResolved(true)
    }
  }

  const applyBootstrap = (catalogue, settingsResponse, buttonRows, paymentRows = []) => {
    const payload = catalogue?.data || catalogue || {}
    const rows = Array.isArray(payload.products) ? payload.products.map(normaliseProduct).filter((product) => product.active) : []
    setProducts(rows)
    setCategories(['All', ...new Set(rows.map((product) => product.category).filter(Boolean))])
    setSettings(settingsResponse?.data || settingsResponse || null)
    setButtons(Array.isArray(buttonRows) ? buttonRows : [])
    setPaymentMethods(Array.isArray(paymentRows) ? paymentRows.filter((method) => method?.active !== false) : [])
  }

  const refreshOfflineCount = async () => {
    try {
      const entries = await offlineQueueEntries()
      setOfflineEntries(entries)
      setOfflineCount(entries.length)
      setOfflineStats(getOfflineSyncStats())
    } catch {
      setOfflineEntries([])
      setOfflineCount(0)
      setOfflineStats(getOfflineSyncStats())
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')

    const sessionUser = getStoredUser()
    const companyContext = sessionUser?.companyId || sessionUser?.company_id
    if (!companyContext) {
      setLoading(false)
      setError('Your account needs a company binding before opening Till.')
      await refreshOfflineCount()
      return
    }

    const cached = loadTillBootstrapCache()
    const cachedScope = cached?.catalogue?.data?.scopeKey || cached?.catalogue?.scopeKey || ''
    const usableCached = cachedScope ? cached : null
    if (usableCached) {
      applyBootstrap(usableCached.catalogue, usableCached.settingsResponse, usableCached.buttons, usableCached.paymentMethods || [])
      setLoading(false)
    }
    try {
      const cachedVersion = usableCached?.catalogue?.data?.version || usableCached?.catalogue?.version || ''
      const catalogueQuery = new URLSearchParams()
      if (cachedVersion) catalogueQuery.set('since', cachedVersion)
      if (cachedScope) catalogueQuery.set('scope', cachedScope)
      const cataloguePath = `/api/products/catalogue${catalogueQuery.size ? `?${catalogueQuery.toString()}` : ''}`
      const [catalogueDelta, settingsResponse, buttonResponse, paymentResponse, permissionResponse] = await Promise.all([
        apiRequest(cataloguePath),
        apiRequest('/api/settings'),
        apiRequest('/api/platform/runtime/objects/sale/buttons'),
        apiRequest('/api/settings/payment-methods').catch(() => ({ data: [] })),
        loadSessionPermissions().catch(() => ({ permissions: [] })),
      ])
      const catalogue = mergeCatalogueResponse(usableCached?.catalogue, catalogueDelta)
      const paymentRows = paymentResponse?.data || []
      applyBootstrap(catalogue, settingsResponse, buttonResponse?.data || [], paymentRows)
      cacheTillBootstrap({ catalogue, settingsResponse, buttons: buttonResponse?.data || [], paymentMethods: paymentRows })
      setPermissions(permissionResponse?.permissions || [])
      setOnline(true)
      await loadTill()
    } catch (err) {
      if (usableCached) {
        applyBootstrap(usableCached.catalogue, usableCached.settingsResponse, usableCached.buttons, usableCached.paymentMethods || [])
        setOnline(false)
        setError('Server unavailable — cached Till loaded. Cash sales only.')
      } else {
        setError(err?.message || 'Unable to load till')
      }
    } finally {
      setLoading(false)
      await refreshOfflineCount()
    }
  }

  useEffect(() => {
    if (typeof BroadcastChannel !== 'function') return undefined
    billChannelRef.current = new BroadcastChannel('onepos-customer-display')
    return () => {
      try { billChannelRef.current?.close() } catch {}
      billChannelRef.current = null
    }
  }, [])

  useEffect(() => {
    const onToast = (event) => {
      if (event?.detail?.message) setMessage(String(event.detail.message))
    }
    window.addEventListener('onepos:toast', onToast)
    return () => window.removeEventListener('onepos:toast', onToast)
  }, [])

  useEffect(() => {
    void load()
    const stopMonitor = startConnectivityMonitoring({ intervalMs: 120000 })
    const unsubscribe = subscribeConnectivity(async (next) => {
      setConnectivity(next)
      const serverOnline = next.server === SERVER_STATES.CONNECTED
      setOnline(serverOnline)
      if (serverOnline) {
        try {
          const result = await syncOfflineCashSales(apiRequest)
          if (result.synced) setMessage(`${result.synced} offline sale${result.synced === 1 ? '' : 's'} synced.`)
        } finally {
          await refreshOfflineCount()
        }
      }
    })
    return () => {
      unsubscribe()
      stopMonitor()
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((product) => {
      if (category !== 'All' && product.category !== category) return false
      return !q || [product.name, product.sku, product.barcode].join(' ').toLowerCase().includes(q)
    })
  }, [products, category, search])

  const grossSubtotal = basket.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    + miscLines.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const discountAmount = discount.type === 'percent'
    ? grossSubtotal * Math.max(0, Number(discount.value || 0)) / 100
    : discount.type === 'fixed' ? Math.max(0, Number(discount.value || 0)) : 0
  const subtotal = Math.max(0, grossSubtotal - discountAmount)
  const vatEnabled = settings?.tax?.vatEnabled !== false
  const defaultVatRate = Number(settings?.tax?.defaultVatRate ?? 0) / 100
  const vat = vatEnabled ? basket.reduce((sum, item) => {
    const line = Number(item.price) * item.quantity
    const share = grossSubtotal ? discountAmount * (line / grossSubtotal) : 0
    const net = Math.max(0, line - share)
    const rate = item.vatApplicable === false ? 0 : Number(item.vatRate || defaultVatRate * 100) / 100
    return sum + (rate > 0 ? net - net / (1 + rate) : 0)
  }, 0) : 0
  const total = subtotal
  const hasAgeRestricted = basket.some((item) => item.ageRestricted)

  useEffect(() => {
    if (!billChannelRef.current) return undefined
    const payload = {
      type: 'BILL',
      basket: [...basket, ...miscLines.map((line, index) => ({ id: `misc-${index}`, name: line.description, price: line.price, quantity: line.quantity }))],
      subtotal,
      vat,
      total,
      discountAmount,
      hasDiscount: discount.type !== null && Number(discount.value || 0) > 0,
      hasCustomer: Boolean(selectedCustomer),
      storeName: settings?.store?.name || 'Till',
      currency,
    }
    try { billChannelRef.current.postMessage(payload) } catch {}
    const heartbeat = window.setInterval(() => {
      try { billChannelRef.current?.postMessage(payload) } catch {}
    }, 5000)
    return () => window.clearInterval(heartbeat)
  }, [basket, miscLines, subtotal, vat, total, discountAmount, discount.type, discount.value, selectedCustomer, settings?.store?.name, currency])

  const addLine = (product, modifiers = []) => {
    setError('')
    setBasket((current) => {
      const found = current.find((item) => item.id === product.id)
      if (found) return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...current, { ...product, quantity: 1, modifiers }]
    })
  }

  const selectProduct = async (product) => {
    let rows = []
    try {
      if (online) {
        const response = await apiRequest(`/api/products/${encodeURIComponent(product.id)}/modifiers`)
        rows = response?.success && Array.isArray(response.data) ? response.data : []
        cacheProductModifiers(product.id, rows)
      } else {
        rows = loadProductModifiers(product.id) || []
      }
    } catch {
      rows = loadProductModifiers(product.id) || []
    }
    const groups = [...new Map(rows.map((row) => [row.group_id, row])).values()].map((row) => ({
      id: row.group_id,
      name: row.group_name,
      required: row.required === true,
      maxSelections: Number(row.max_selections) || 1,
      options: rows.filter((option) => option.group_id === row.group_id && option.id),
    }))
    if (groups.length) setModifierPicker({ product, groups })
    else addLine(product)
  }

  useEffect(() => {
    let scanned = ''
    let timer
    const onKeyDown = (event) => {
      if (event.key === 'Enter') {
        const barcode = scanned.trim()
        scanned = ''
        if (barcode) {
          const product = products.find((item) => String(item.barcode || '') === barcode)
          if (product) void selectProduct(product)
          else setError(`Unknown barcode: ${barcode}`)
        }
        return
      }
      if (event.key?.length === 1) {
        scanned += event.key
        window.clearTimeout(timer)
        timer = window.setTimeout(() => { scanned = '' }, 120)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(timer)
    }
  }, [products, online])

  useEffect(() => {
    if (!online || !till?.terminal_id) return undefined
    let stopped = false
    let scannerUnavailable = false
    let timer
    const poll = async () => {
      try {
        const response = await apiRequest(`/api/mobile-scanner/events?terminalId=${encodeURIComponent(till.terminal_id)}`)
        if (!stopped && response?.success) {
          for (const event of response.data || []) {
            const barcode = String(event?.barcode || '').trim()
            const product = products.find((item) => String(item.barcode || '') === barcode)
            if (product) await selectProduct(product)
          }
        }
      } catch (err) {
        if (err?.status === 401 || err?.status === 403 || err?.status === 404) {
          scannerUnavailable = true
        }
      }
      if (!stopped && !scannerUnavailable) timer = window.setTimeout(poll, 10000)
    }
    if (!document.hidden) void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [online, till?.terminal_id, products])

  useEffect(() => {
    if (!online || !permissions.includes('online_orders.view')) return undefined
    let stopped = false
    const loadOrders = async () => {
      try {
        const response = await apiRequest('/api/online/orders?status=RECEIVED&limit=50')
        if (!stopped && response?.success) {
          const next = Array.isArray(response.data) ? response.data.length : 0
          setOnlineOrderCount((previous) => {
            if (next > previous) setOnlineOrderToast('New online order received')
            return next
          })
        }
      } catch {}
    }
    void loadOrders()
    const timer = window.setInterval(() => { if (!document.hidden) void loadOrders() }, 60000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [online, permissions])

  const changeQty = (id, delta) => setBasket((current) => current.map((item) => {
    if (item.id !== id) return item
    const next = item.quantity + delta
    if (delta > 0 && !allowNegativeBilling && item.trackStock !== false && next > Number(item.stock || 0)) {
      setError(`Only ${Number(item.stock || 0)} left in stock for ${item.name}.`)
      return item
    }
    return { ...item, quantity: next }
  }).filter((item) => item.quantity > 0))

  const clearSale = () => {
    if (receiptQr?.saleId && settings?.receiptQr?.autoCloseOnNewSale !== false) void revokeReceiptQr(receiptQr.saleId)
    setBasket([])
    setMiscLines([])
    setSelectedCustomer(null)
    setDiscount({ type: null, value: 0 })
    setAgeVerified(false)
    setCashReceived('')
  }

  const buildSalePayload = (paymentMethod, verifiedOverride = false, options = {}) => ({
    clientRequestId: crypto.randomUUID(),
    items: basket.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
      ...(Array.isArray(item.modifiers) && item.modifiers.length ? { modifiers: item.modifiers } : {}),
      ...(item.priceOverride ? { priceOverride: item.priceOverride, priceOverrideReason: item.priceOverrideReason || null } : {}),
    })),
    customerId: selectedCustomer?.id || null,
    miscLines: miscLines.map((line) => ({ description: line.description, price: line.price, quantity: line.quantity, vatRate: line.vatRate })),
    vatEnabled,
    vatRate: defaultVatRate,
    paymentMethod,
    cashReceived: paymentMethod === 'cash'
      ? ((options.cashReceived ?? cashReceived) === '' || (options.cashReceived ?? cashReceived) == null ? null : Number(options.cashReceived ?? cashReceived))
      : null,
    ...(Array.isArray(options.payments) && options.payments.length ? { payments: options.payments } : {}),
    ...(options.giftCardCode ? { giftCardCode: options.giftCardCode } : {}),
    discountType: discount.type,
    discountValue: discount.value,
    ageVerified: hasAgeRestricted ? (ageVerified || verifiedOverride) : false,
  })

  const maybeShowReceiptQr = async (sale) => {
    if (!sale?.id) return
    const allowed = await runReceiptPolicy('AUTO')
    if (!allowed) return
    const button = buttons.find((row) => row.button_key === 'till_receipt_qr')
    if (!button) return
    const response = await executeMetadataButton(button, {
      expiryMinutes: Number(settings?.receiptQr?.expiryMinutes || 5),
      baseUrl: window.location.origin,
    }, sale.id)
    const qrUrl = deepFind(response?.data, 'qrcodeUrl')
    if (!qrUrl) return
    const next = {
      id: deepFind(response?.data, 'id') || null,
      token: deepFind(response?.data, 'token') || null,
      url: deepFind(response?.data, 'url') || null,
      qrcodeUrl: qrUrl,
      expiresAt: deepFind(response?.data, 'expiresAt') || null,
      saleId: sale.id,
    }
    setReceiptQr(next)
    emitReceiptQr({ active: true, ...next })
    setModal('receipt_qr')
  }

  const completeSale = async (paymentMethod, { verifiedOverride = false, payments = null, giftCardCode = '', cashReceivedOverride = null, skipStockWarning = false } = {}) => {
    if (!basket.length && !miscLines.length) return setError('Sale contains no items.')
    if (hasAgeRestricted && !ageVerified && !verifiedOverride) {
      setPendingPayment(paymentMethod)
      setPendingSaleRequest({ paymentMethod, options: { verifiedOverride: true, payments, giftCardCode, cashReceivedOverride } })
      setModal('age')
      return
    }
    if (!till && online) {
      setModal('till')
      return setError('Open a till session before completing a sale.')
    }
    const selectedMethod = paymentMethods.find((method) => method.code === paymentMethod)
    if (!online && paymentMethod !== 'cash' && selectedMethod?.allowOffline !== true) return setError('This payment method requires an online connection.')
    const received = paymentMethod === 'cash' ? Number((cashReceivedOverride ?? cashReceived) || 0) : null

    setBusy(true)
    setError('')
    const payload = buildSalePayload(paymentMethod, verifiedOverride, { payments, giftCardCode, cashReceived: received })
    let durableCashEntry = null
    try {
      if (paymentMethod === 'cash') {
        durableCashEntry = await enqueueOfflineCashSale(payload, till?.terminal_number || till?.terminalNumber || 'T')
      }
      if (!online && paymentMethod === 'cash') {
        const entry = durableCashEntry
        clearSale()
        setLastSale({ id: null, receipt_number: entry.provisionalReceipt, total, offline: true })
        setMessage(`Cash sale saved offline · ${entry.provisionalReceipt} · Pending sync.`)
        setSaleCompleteNotice({ receiptNumber: entry.provisionalReceipt, total, received, change: Math.max(0, received - total), pendingSync: true })
        await refreshOfflineCount()
        return
      }
      const response = await apiRequest('/api/sales', { method: 'POST', body: JSON.stringify(payload) })
      if (!response?.success || !response?.sale?.id) throw new Error(response?.message || 'Sale could not be confirmed')
      const sale = response.sale
      if (durableCashEntry) await removeOfflineCashSale(durableCashEntry.id)
      setLastSale(sale)
      clearSale()
      const serverTotal = Number(sale.total || 0)
      const change = paymentMethod === 'cash' ? Math.max(0, Number(received || 0) - serverTotal) : 0
      setSaleCompleteNotice({
        receiptNumber: sale.receipt_number || null,
        total: serverTotal,
        received: paymentMethod === 'cash' ? received : null,
        change,
        pendingSync: false,
      })
      setMessage(paymentMethod === 'cash'
        ? `Sale complete${sale.receipt_number ? ` · ${sale.receipt_number}` : ''} · Change ${money(change, currency)}`
        : `${selectedMethod?.label || paymentMethod} sale complete${sale.receipt_number ? ` · ${sale.receipt_number}` : ''}`)
      await maybeShowReceiptQr(sale)
      await load()
    } catch (err) {
      if (paymentMethod === 'cash' && durableCashEntry && (err instanceof TypeError || err?.status >= 500 || navigator.onLine === false)) {
        clearSale()
        setLastSale({ id: null, receipt_number: durableCashEntry.provisionalReceipt, total, offline: true })
        setOnline(false)
        setMessage(`Cash sale saved offline · ${durableCashEntry.provisionalReceipt} · Pending sync.`)
        setSaleCompleteNotice({ receiptNumber: durableCashEntry.provisionalReceipt, total, received, change: Math.max(0, received - total), pendingSync: true })
        await refreshOfflineCount()
        return
      }
      if (durableCashEntry) await failOfflineCashSale(durableCashEntry.id, err?.message)
      setError(err?.message || 'Unable to complete sale')
    } finally {
      setBusy(false)
    }
  }

  const holdSale = async () => {
    if (!basket.length && !miscLines.length) return setError('Add an item before holding the sale.')
    const user = getStoredUser() || {}
    setBusy(true)
    try {
      const response = await apiRequest('/api/platform/objects/held_sale/records', {
        method: 'POST',
        body: JSON.stringify({ data: {
          user_id: user.id || user.userId || null,
          customer_id: selectedCustomer?.id || null,
          items: { items: basket, miscLines },
          discount_type: discount.type,
          discount_value: Number(discount.value || 0),
        } }),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to hold sale')
      clearSale()
      setMessage('Sale held successfully.')
    } catch (err) { setError(err?.message || 'Unable to hold sale') } finally { setBusy(false) }
  }

  const openHeld = async () => {
    try {
      const response = await apiRequest('/api/platform/objects/held_sale/records?page=1&pageSize=100')
      const rows = Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : []
      setHeldSales(rows)
      setModal('held')
    } catch (err) { setError(err?.message || 'Unable to load held sales') }
  }

  const resumeHeld = async (id) => {
    try {
      const response = await apiRequest(`/api/platform/objects/held_sale/records/${encodeURIComponent(id)}`)
      const held = response?.record || response?.data || response || {}
      const heldItems = held.items || {}
      if (Array.isArray(heldItems)) {
        setBasket(heldItems)
        setMiscLines([])
      } else {
        setBasket(Array.isArray(heldItems.items) ? heldItems.items : [])
        setMiscLines(Array.isArray(heldItems.miscLines) ? heldItems.miscLines : [])
      }
      setDiscount({ type: held.discount_type || null, value: Number(held.discount_value || 0) })
      await apiRequest(`/api/platform/objects/held_sale/records/${encodeURIComponent(id)}`, { method: 'DELETE' })
      setModal(null)
      setMessage('Held sale resumed.')
    } catch (err) { setError(err?.message || 'Unable to resume sale') }
  }

  useEffect(() => {
    const customerId = selectedCustomer?.id
    if (!customerId || !online) {
      setLiveCredit(null)
      return
    }
    let active = true
    apiRequest(`/api/platform/objects/customer_credit_account/records/${encodeURIComponent(customerId)}`)
      .then((response) => { if (active) setLiveCredit(response?.record || response?.data || response || null) })
      .catch(() => { if (active) setLiveCredit(null) })
    return () => { active = false }
  }, [selectedCustomer?.id, online])

  const searchCustomers = async (value) => {
    setCustomerSearch(value)
    if (!value.trim()) return setCustomers([])
    try { const response = await apiRequest(`/api/customer-lookup?search=${encodeURIComponent(value.trim())}`); setCustomers(response?.data || []) } catch { setCustomers([]) }
  }

  const emitReceiptQr = (payload = {}) => {
    try { billChannelRef.current?.postMessage({ type: 'RECEIPT_QR', ...payload }) } catch {}
  }

  const revokeReceiptQr = async (saleId = receiptQr?.saleId || lastSale?.id) => {
    if (saleId) {
      try { await apiRequest(`/api/sales/${encodeURIComponent(saleId)}/receipt-qr`, { method: 'DELETE' }) } catch {}
    }
    emitReceiptQr({ active: false, cleared: true, saleId: saleId || null })
    setReceiptQr(null)
  }

  const generateReceiptQr = async (saleId = lastSale?.id) => {
    if (!saleId) return setError('A synced completed sale is required for Receipt QR.')
    try {
      if (receiptQr?.saleId && receiptQr.saleId !== saleId) await revokeReceiptQr(receiptQr.saleId)
      const expiryMinutes = Number(settings?.receiptQr?.expiryMinutes || 5)
      const response = await apiRequest(`/api/sales/${encodeURIComponent(saleId)}/receipt-qr`, { method: 'POST', body: JSON.stringify({ expiryMinutes }) })
      if (!response?.success || !response?.data?.qrcodeUrl) throw new Error(response?.message || 'Unable to create Receipt QR')
      const next = { ...response.data, saleId: response.data.saleId || saleId }
      setReceiptQr(next)
      emitReceiptQr({ active: true, ...next })
      setModal('receipt_qr')
    } catch (err) { setError(err?.message || 'Unable to create Receipt QR') }
  }

  const executeRecordButton = async (button, recordId) => {
    if (!button?.button_key || !recordId) throw new Error('A synced sale is required for this action.')
    const response = await apiRequest(`/api/platform/objects/sale/records/${encodeURIComponent(recordId)}/buttons/${encodeURIComponent(button.button_key)}/execute`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (response?.success === false) throw new Error(response.message || 'Unable to execute Till action')
    return response?.data || response
  }

  const printReceipt = async (button) => {
    if (!lastSale?.id) return setError('A synced completed sale is required for printing.')
    setBusy(true)
    setError('')
    try {
      const result = await executeRecordButton(button, lastSale.id)
      setMessage(result?.message || 'Receipt sent to the configured printer.')
    } catch (err) {
      setError(err?.message || 'Unable to print receipt')
    } finally {
      setBusy(false)
    }
  }

  const openDrawer = async () => {
    try {
      const response = await apiRequest('/api/till/drawer/open', { method: 'POST', body: JSON.stringify({ terminalId: till?.terminal_id || till?.terminalId || null, reason: 'No-sale drawer open from Till' }) })
      setMessage(response?.message || 'Drawer open recorded.')
    } catch (err) { setError(err?.message || 'Unable to open drawer') }
  }

  const recordPettyCash = async (amount, reason) => {
    if (!till?.id) return setError('Open a till before recording petty cash.')
    const button = buttons.find((row) => row.button_key === 'till_petty_cash_submit')
    if (!button) return setError('Petty cash Flow is not configured.')
    try {
      await executeMetadataButton(button, {
        amount: Number(amount),
        reason: reason ? `Petty cash: ${reason}` : 'Petty cash',
        tillSessionId: till.id,
        userId: getStoredUser()?.id || getStoredUser()?.userId || null,
      })
      setModal(null)
      setMessage('Petty cash recorded.')
    } catch (err) { setError(err?.message || 'Unable to record petty cash') }
  }

  const customerDisplayEnabled =
    settings?.till?.customerDisplayEnabled === true
    || settings?.customerDisplayEnabled === true
    || settings?.storeTill?.customerDisplayEnabled === true

  const openCustomerDisplay = () => {
    if (!customerDisplayEnabled) {
      setError('Enable Customer Display in Settings → Store & Till first.')
      return
    }
    const base = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
    const popup = window.open(`${base}customer-display`, 'onepos-customer-display', 'noopener,noreferrer')
    if (!popup) setError('Browser blocked the Customer Display window. Allow pop-ups and try again.')
  }

  const deepFind = (value, key) => {
    if (!value || typeof value !== 'object') return undefined
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key]
    for (const child of Object.values(value)) {
      const found = deepFind(child, key)
      if (found !== undefined) return found
    }
    return undefined
  }

  const executeMetadataButton = async (button, contextOverride = {}, recordIdOverride = null) => {
    if (!button?.button_key) throw new Error('Till action metadata is incomplete.')
    setBusy(true)
    setError('')
    try {
      const wantsLastSale = button?.config?.recordContext === 'last_sale'
        || button?.config?.record_context === 'last_sale'
        || button?.config?.requiresPersistedRecord === true
        || button?.config?.requires_persisted_record === true

      const scopedRecordId = recordIdOverride || lastSale?.id || null
      if (wantsLastSale && !scopedRecordId) throw new Error('Complete a sale before using this action.')

      const context = {
        storeId: till?.store_id || settings?.store?.id || getStoredUser()?.storeId || null,
        terminalId: till?.terminal_id || null,
        tillSessionId: till?.id || null,
        userId: getStoredUser()?.id || getStoredUser()?.userId || null,
        customerId: selectedCustomer?.id || null,
        subtotal,
        vat,
        discount: discountAmount,
        total,
        basket: [
          ...basket.map((item) => ({
            productId: item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            modifiers: item.modifiers || [],
          })),
          ...miscLines.map((line) => ({
            itemType: 'MISC',
            name: line.description,
            quantity: line.quantity,
            unitPrice: line.price,
          })),
        ],
        ...contextOverride,
      }

      const endpoint = wantsLastSale && scopedRecordId
        ? `/api/platform/objects/sale/records/${encodeURIComponent(scopedRecordId)}/buttons/${encodeURIComponent(button.button_key)}/execute`
        : `/api/platform/runtime/objects/sale/buttons/${encodeURIComponent(button.button_key)}/execute`

      const response = await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(wantsLastSale && scopedRecordId ? { inputs: context } : { context }),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to run Till action')
      return response
    } finally {
      setBusy(false)
    }
  }

  const runReceiptPolicy = async (event) => {
    const button = buttons.find((row) => row.button_key === 'till_receipt_qr_policy')
    if (!button) return false
    let printerAvailable = false
    if (event === 'AUTO' && String(settings?.receiptQr?.showAfterSuccessfulPayment || '').toUpperCase() === 'ONLY_WHEN_PRINTER_UNAVAILABLE') {
      try {
        const status = await apiRequest('/api/connector-capabilities/printer.status')
        printerAvailable = status?.data?.available === true
      } catch {}
    }
    const response = await executeMetadataButton(button, {
      event,
      mode: String(settings?.receiptQr?.showAfterSuccessfulPayment || 'OFF').toUpperCase(),
      printerAvailable,
      allowManual: settings?.receiptQr?.allowManualQr !== false,
      allowRegenerate: settings?.receiptQr?.allowRegenerate !== false,
    })
    return deepFind(response?.data, 'allowed') === true || deepFind(response?.data, 'value') === true
  }

  const executeTillTarget = async (button, item = null) => {
    if (!button) return
    const type = String(button.target_type || 'action').toLowerCase()
    const config = button.config || {}

    if (type === 'modal') {
      if (button.target_key === 'price_override' && item) setPriceTarget(item)
      setModal(config.modal || button.target_key)
      return
    }
    if (type === 'navigation') {
      onNavigate?.(config.route || button.target_key)
      return
    }
    if (type === 'crud') {
      if (config.uiHandler === 'hold_sale') return holdSale()
      if (config.uiHandler === 'resume_sale') return openHeld()
      if (config.modal) setModal(config.modal)
      return
    }
    if (type === 'workflow') {
      if (config.policyEvent) {
        const allowed = await runReceiptPolicy(config.policyEvent)
        if (!allowed) return
      }
      const response = await executeMetadataButton(button, {
        expiryMinutes: Number(settings?.receiptQr?.expiryMinutes || 5),
        baseUrl: window.location.origin,
      })
      const qrUrl = deepFind(response?.data, 'qrcodeUrl')
      if (qrUrl) {
        const next = {
          id: deepFind(response?.data, 'id') || null,
          token: deepFind(response?.data, 'token') || null,
          url: deepFind(response?.data, 'url') || null,
          qrcodeUrl: qrUrl,
          expiresAt: deepFind(response?.data, 'expiresAt') || null,
          saleId: lastSale?.id || null,
        }
        setReceiptQr(next)
        emitReceiptQr({ active: true, ...next })
        setModal('receipt_qr')
      }
      return
    }
    if (type === 'command') {
      const command = config.command || button.target_key
      if (command === 'clear_sale') { clearSale(); setMessage('Sale cleared.'); return }
      if (command === 'print_receipt') return printReceipt(button)
      if (command === 'open_drawer') return openDrawer()
      if (command === 'customer_display') return openCustomerDisplay()
      if (command === 'checkout') return completeSale(config.paymentMethod || 'cash')
    }
  }

  const headerButtons = buttons.filter((button) => button.placement === 'till_action_header')
  const actionButtons = buttons.filter((button) => {
    if (button.placement !== 'till_action_bar') return false
    const action = button?.config?.uiAction || button?.config?.ui_action
    if (action === 'customer_display' && !customerDisplayEnabled) return false
    return true
  })
  const paymentButtons = buttons.filter((button) => button.placement === 'till_payment')
  const lineButtons = buttons.filter((button) => button.placement === 'till_line_action')
  const productView = settings?.till?.productView || 'image'

  return (
    <section className="till-theme-page">
      <div className="till-theme-window">
        <header className="till-theme-header">
          <div><strong>{settings?.store?.name || 'Till'}</strong><span>{!tillStatusResolved ? 'Checking till…' : till ? `${till.terminal_name || till.terminalNumber || 'Till'} · Open` : 'Till closed'}{offlineCount ? ` · ${offlineCount} pending sync` : ''}</span></div>
          <div className="till-theme-header-actions">
            {offlineCount ? <button type="button" className="till-settings-button" onClick={() => setModal('offline_queue')} title="Offline sales queue" aria-label="Offline sales queue"><CloudQueueIcon count={offlineCount}/></button> : null}
            <span className="till-connectivity-status" title={`Server: ${connectivity.server} · Database: ${connectivity.database}`}>
              <i className={connectivity.server === SERVER_STATES.CONNECTED && connectivity.database !== DB_STATES.UNAVAILABLE ? 'is-online' : 'is-offline'} />
            </span>
            <button type="button" className="till-settings-button" onClick={onOpenSettings} title="Settings" aria-label="Settings"><Settings2 size={15}/></button>
            {headerButtons.map((button) => <MetaButton key={button.id || button.button_key} button={button} onAction={(_, item, button) => executeTillTarget(button, item)}/>)}
          </div>
        </header>

        <div className="till-action-bar">
          {actionButtons.map((button) => <MetaButton key={button.id || button.button_key} button={button} onAction={(_, item, button) => executeTillTarget(button, item)} disabled={busy || (button.config?.uiAction === 'print' && !lastSale?.id)}/>)}
        </div>

        <div className="till-main-grid">
          <main className="till-catalogue">
            <div className="till-catalogue-tools">
              <label><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or scan barcode" autoFocus/></label>
              <div className="till-categories">{categories.map((name) => <button key={name} type="button" className={category === name ? 'is-active' : ''} onClick={() => setCategory(name)}>{name}</button>)}</div>
            </div>

            {!online ? <div className="till-notice">Offline mode · cash only · sales are stored durably and synced later.</div> : null}
            {onlineOrderCount ? <div className="till-notice">{onlineOrderCount} online order${onlineOrderCount === 1 ? '' : 's'} waiting</div> : null}
            {onlineOrderToast ? <button type="button" className="till-notice" onClick={() => setOnlineOrderToast('')}>{onlineOrderToast}</button> : null}
            {error ? <div className="till-notice is-error">{error}</div> : null}
            {message ? <div className="till-notice">{message}</div> : null}

            <div className={`till-product-grid ${productView === 'compact' ? 'is-compact' : ''}`}>
              {loading ? <div className="till-empty">Loading catalogue…</div> : filtered.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className={`till-product-card ${product.trackStock && product.stock < 0 ? 'has-negative-stock is-negative-stock' : ''}`}
                  title={product.name}
                  onClick={() => selectProduct(product)}
                >
                  {productView !== 'compact' ? <div className="till-product-image"><ProductImage src={product.imageUrl}/></div> : null}
                  <strong>{product.name}</strong>
                  <span>{money(product.price, currency)}</span>
                  {product.trackStock ? <small title={product.stock < 0 ? 'Recorded stock is below zero' : undefined}>{product.stock} in stock{product.stock < 0 ? ' (negative)' : ''}</small> : <small>Non-stock</small>}
                </button>
              ))}
              {!loading && !filtered.length ? <div className="till-empty">No products found.</div> : null}
            </div>
          </main>

          <aside className="till-cart">
            <div className="till-cart-head"><div><strong>Current Sale</strong><span>{selectedCustomer?.name || 'Walk-in Customer'}</span></div><ReceiptText size={18}/></div>
            <div className="till-cart-lines">
              {!basket.length && !miscLines.length ? <div className="till-cart-empty"><ShoppingBag size={32}/><strong>No items</strong><span>Select a product to begin</span></div> : null}
              {basket.map((item) => (
                <div className="till-cart-line" key={item.id}>
                  <div><strong>{item.name}</strong><small>{money(item.price, currency)} each{item.priceOverride ? ' · price changed' : ''}</small></div>
                  <strong>{money(item.price * item.quantity, currency)}</strong>
                  <div className="till-qty">
                    <button type="button" onClick={() => changeQty(item.id, -1)}><Minus size={12}/></button><span>{item.quantity}</span><button type="button" onClick={() => changeQty(item.id, 1)}><Plus size={12}/></button>
                    {lineButtons.map((button) => <button key={button.id || button.button_key} type="button" title={button.label} onClick={() => executeTillTarget(button, item)}><Pencil size={12}/></button>)}
                    <button type="button" onClick={() => setBasket((rows) => rows.filter((row) => row.id !== item.id))}><X size={12}/></button>
                  </div>
                </div>
              ))}
              {miscLines.map((line, index) => <div className="till-cart-line" key={`misc-${index}`}><div><strong>{line.description}</strong><small>Misc Item</small></div><strong>{money(line.price * line.quantity, currency)}</strong><button type="button" className="till-remove-misc" onClick={() => setMiscLines((rows) => rows.filter((_, i) => i !== index))}><X size={12}/></button></div>)}
            </div>

            <div className="till-cart-summary">
              <div><span>Subtotal</span><strong>{money(grossSubtotal, currency)}</strong></div>
              {discountAmount > 0 ? <div><span>Discount</span><strong>-{money(discountAmount, currency)}</strong></div> : null}
              <div><span>VAT</span><strong>{money(vat, currency)}</strong></div>
              <div className="is-total"><span>Total</span><strong>{money(total, currency)}</strong></div>
              <label className="till-cash-input"><Banknote size={15}/><input value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} inputMode="decimal" placeholder="Cash received"/></label>
              <div className="till-pay-grid">
                {paymentButtons.map((button) => <MetaButton key={button.id || button.button_key} button={button} onAction={(_, item, button) => executeTillTarget(button, item)} disabled={busy || (!basket.length && !miscLines.length) || (!online && button?.config?.paymentMethod === 'card')} className={button?.config?.paymentMethod === 'cash' ? 'till-pay-cash' : 'till-pay-card'}/>)}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {modifierPicker ? <ModifierPicker product={modifierPicker.product} groups={modifierPicker.groups} onClose={() => setModifierPicker(null)} onConfirm={(modifiers) => { addLine(modifierPicker.product, modifiers); setModifierPicker(null) }}/> : null}
      {modal === 'negative_stock' && negativeStockNotice ? <Modal title="Stock warning" onClose={() => { setNegativeStockNotice(null); setPendingSaleRequest(null); setModal(null) }}><div className="till-form"><p>The following items exceed recorded stock. Continue only if this sale is intentional.</p>{negativeStockNotice.map((line) => <div key={line.name} className="till-stock-warning-row"><strong>{line.name}</strong><span>{line.recordedStock} recorded · {line.requestedQuantity} requested</span></div>)}<button type="button" className="till-primary" onClick={() => { const pending = pendingSaleRequest; setNegativeStockNotice(null); setPendingSaleRequest(null); setModal(null); if (pending) void completeSale(pending.paymentMethod, pending.options) }}>Continue Sale</button></div></Modal> : null}
      {modal === 'discount' ? <Modal title={meta.discount?.label || 'Discount'} onClose={() => setModal(null)}><DiscountForm value={discount} onApply={(next) => { setDiscount(next); setModal(null) }}/></Modal> : null}
      {modal === 'misc' ? <Modal title={meta.misc?.label || 'Misc Item'} onClose={() => setModal(null)}><MiscForm vatEnabled={vatEnabled} defaultVatRate={Number(settings?.tax?.defaultVatRate ?? 0)} onAdd={(line) => { setMiscLines((rows) => [...rows, line]); setModal(null) }}/></Modal> : null}
      {modal === 'petty' ? <Modal title={meta.petty?.label || 'Petty Cash'} onClose={() => setModal(null)}><PettyForm onSubmit={recordPettyCash}/></Modal> : null}
      {modal === 'customer' ? <Modal title={meta.customer?.label || 'Select Customer'} onClose={() => setModal(null)} wide><label className="till-modal-search"><Search size={15}/><input value={customerSearch} onChange={(e) => searchCustomers(e.target.value)} placeholder="Search name, phone or email"/></label><div className="till-customer-results"><button type="button" onClick={() => { setSelectedCustomer(null); setModal(null) }}>Walk-in Customer</button>{customers.map((customer) => <button key={customer.id} type="button" onClick={() => { setSelectedCustomer(customer); setModal(null) }}><strong>{customer.name}</strong><span>{customer.phone || customer.email || ''}</span></button>)}</div></Modal> : null}
      {modal === 'held' ? <Modal title={meta.resume?.label || 'Held Sales'} onClose={() => setModal(null)} wide><div className="till-held-list">{heldSales.map((sale) => <button key={sale.id} type="button" onClick={() => resumeHeld(sale.id)}><strong>{sale.customer_name || 'Held Sale'}</strong><span>{sale.created_at ? new Date(sale.created_at).toLocaleString() : ''}</span></button>)}{!heldSales.length ? <div className="till-empty">No held sales.</div> : null}</div></Modal> : null}
      {modal === 'till' ? <Modal title={meta.till_session?.label || 'Till Session'} onClose={() => setModal(null)} wide><TillSessionPanel till={till} buttons={buttons.filter((button) => button.placement === 'till_session')} currency={currency} onChanged={loadTill} onMessage={setMessage} onError={setError}/></Modal> : null}
      {modal === 'age' ? <Modal title="Age Verification" onClose={() => { setPendingPayment(null); setPendingSaleRequest(null); setModal(null) }}><div className="till-form"><p>Confirm that the required age check has been completed for this sale.</p><button type="button" className="till-primary" onClick={() => { const pending = pendingSaleRequest || { paymentMethod: pendingPayment, options: { verifiedOverride: true } }; setAgeVerified(true); setPendingPayment(null); setPendingSaleRequest(null); setModal(null); window.setTimeout(() => completeSale(pending.paymentMethod, pending.options), 0) }}>Age verified</button></div></Modal> : null}
      {modal === 'payment' ? <Modal title="Payment" onClose={() => setModal(null)} wide><PaymentSheet total={total} methods={paymentMethods} online={online} customer={selectedCustomer} credit={liveCredit || selectedCustomer?.credit || null} onPay={async (method, options) => { await completeSale(method, options || {}); setModal(null) }}/></Modal> : null}
      {modal === 'price_override' && priceTarget ? <Modal title={meta.price_override?.label || 'Change Price'} onClose={() => { setPriceTarget(null); setModal(null) }}><PriceOverrideForm item={priceTarget} onApply={async (price, reason) => {
        const button = buttons.find((row) => row.button_key === 'till_price_override_apply')
        if (!button) return setError('Price Override Flow is not configured.')
        try {
          await executeMetadataButton(button, {
            productId: priceTarget.id,
            originalPrice: Number(priceTarget.price || 0),
            requestedPrice: Number(price),
            reason: reason || null,
          })
          setBasket((rows) => rows.map((row) => row.id === priceTarget.id ? { ...row, price: Number(price), priceOverride: Number(price), priceOverrideReason: reason } : row))
          setPriceTarget(null)
          setModal(null)
        } catch (err) { setError(err?.message || 'Price override was rejected.') }
      }}/></Modal> : null}
      {modal === 'receipt_qr' && receiptQr ? <Modal title={meta.receipt_qr?.label || 'Receipt QR'} onClose={() => { void revokeReceiptQr(); setModal(null) }}><div className="till-receipt-qr">{receiptQr.qrcodeUrl ? <img src={receiptQr.qrcodeUrl} alt="Receipt QR"/> : null}{settings?.receiptQr?.showCountdown !== false ? <p>{receiptQr.expiresAt ? `Expires ${new Date(receiptQr.expiresAt).toLocaleTimeString()}` : ''}</p> : null}<button type="button" className="till-primary" onClick={async () => {
        const allowed = await runReceiptPolicy('REGENERATE')
        if (!allowed) return
        const button = buttons.find((row) => row.button_key === 'till_receipt_qr')
        if (button) await executeTillTarget(button)
      }}>Regenerate QR</button></div></Modal> : null}
      {modal === 'offline_queue' ? <Modal title="Offline sales queue" onClose={() => setModal(null)} wide><div className="till-offline-queue"><p>Saved cash sales sync automatically when the onePOS server is reachable. Failed sales remain here for review.</p><div className="till-offline-stats"><div><strong>{offlineEntries.filter((entry) => entry.status !== 'failed').length}</strong><span>Pending</span></div><div><strong>{offlineEntries.filter((entry) => entry.status === 'failed').length}</strong><span>Needs attention</span></div><div><strong>{offlineStats.syncedTotal || 0}</strong><span>Synced</span></div><div><strong>{offlineStats.lastSyncedAt ? new Date(offlineStats.lastSyncedAt).toLocaleTimeString() : '—'}</strong><span>Last sync</span></div></div>{offlineStats.lastError ? <div className="till-notice is-error">{offlineStats.lastError}</div> : null}{offlineEntries.length ? offlineEntries.map((entry) => <div className="till-offline-row" key={entry.id}><div><strong>{entry.provisionalReceipt || 'Saved sale'}</strong><span>{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''} · {entry.status === 'failed' ? 'Needs attention' : 'Pending sync'}</span>{entry.lastError ? <small>{entry.lastError}</small> : null}</div>{entry.status === 'failed' ? <button type="button" onClick={async () => { await retryOfflineCashSale(entry.id); await syncOfflineCashSales(apiRequest); await refreshOfflineCount() }}>Retry</button> : null}</div>) : <div className="till-empty">No sales waiting to sync.</div>}<div className="till-form-actions"><button type="button" onClick={async () => { await syncOfflineCashSales(apiRequest); await refreshOfflineCount() }}>Sync pending</button>{offlineEntries.some((entry) => entry.status === 'failed') ? <button type="button" className="till-primary" onClick={async () => { await retryAllOfflineCashSales(); await syncOfflineCashSales(apiRequest); await refreshOfflineCount() }}>Retry all failed</button> : null}</div></div></Modal> : null}
      {saleCompleteNotice ? <Modal title={saleCompleteNotice.pendingSync ? 'Sale saved — pending sync' : 'Transaction complete'} onClose={() => setSaleCompleteNotice(null)}><div className="till-form"><p>{saleCompleteNotice.receiptNumber ? `Receipt ${saleCompleteNotice.receiptNumber}` : 'Sale complete'}</p><div className="till-payment-remaining"><span>Total</span><strong>{money(saleCompleteNotice.total, currency)}</strong></div>{saleCompleteNotice.received != null ? <div className="till-payment-remaining"><span>Cash received</span><strong>{money(saleCompleteNotice.received, currency)}</strong></div> : null}<div className="till-payment-remaining"><span>Change</span><strong>{money(saleCompleteNotice.change, currency)}</strong></div><button type="button" className="till-primary" onClick={() => setSaleCompleteNotice(null)}>OK</button></div></Modal> : null}
    </section>
  )
}

function PaymentSheet({ total, methods, online, customer, credit, onPay }) {
  const activeMethods = (methods || []).filter((method) => method.active !== false)
  const [mode, setMode] = useState('single')
  const [method, setMethod] = useState(activeMethods[0]?.code || 'cash')
  const [cashReceived, setCashReceived] = useState('')
  const [giftCardCode, setGiftCardCode] = useState('')
  const [split, setSplit] = useState(() => Object.fromEntries(activeMethods.map((item) => [item.code, ''])))
  const selected = activeMethods.find((item) => item.code === method)
  const splitEligible = activeMethods.filter((item) => !['customer_credit','gift_card'].includes(item.code))
  const splitLines = splitEligible.map((item) => ({ paymentMethod: item.code, amount: Math.round((Number(split[item.code]) || 0) * 100) / 100 })).filter((line) => line.amount > 0)
  const splitTotal = splitLines.reduce((sum, line) => sum + line.amount, 0)
  const remaining = Math.round((total - splitTotal) * 100) / 100
  const unavailable = !online && selected?.allowOffline !== true
    || method === 'card' && !cardAvailable
    || method === 'customer_credit' && !customer

  if (mode === 'split') return <div className="till-form">
    <p>Split the total across configured payment methods. The amounts must equal the sale total.</p>
    {splitEligible.map((item) => <label key={item.code}>{item.label}<input type="number" min="0" step="0.01" value={split[item.code] || ''} onChange={(e) => setSplit((current) => ({ ...current, [item.code]: e.target.value }))}/></label>)}
    <div className="till-payment-remaining"><span>Remaining</span><strong>{money(remaining)}</strong></div>
    <div className="till-form-actions"><button type="button" onClick={() => setMode('single')}>Back</button><button type="button" className="till-primary" disabled={!splitLines.length || remaining !== 0} onClick={() => onPay('split', { payments: splitLines })}>Complete Split Payment</button></div>
  </div>

  return <div className="till-form">
    <label>Payment method<select value={method} onChange={(e) => setMethod(e.target.value)}>{activeMethods.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
    {!online ? <p>Offline mode only allows payment methods marked for offline use.</p> : null}
    {method === 'card' && !cardAvailable ? <p>No healthy payment connector is assigned to this till.</p> : null}
    {method === 'customer_credit' ? <p>{customer ? `${customer.name || 'Customer'} · Available ${money(credit?.available || 0)}` : 'Select a customer before using customer credit.'}</p> : null}
    {method === 'gift_card' ? <label>Gift card code<input value={giftCardCode} onChange={(e) => setGiftCardCode(e.target.value)} placeholder="Scan or enter gift card code"/></label> : null}
    {method === 'cash' ? <label>Cash received<input type="number" min="0" step="0.01" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder={money(total)}/></label> : null}
    <div className="till-form-actions">
      <button type="button" disabled={!online} onClick={() => setMode('split')}><Layers size={14}/> Split Payment</button>
      <button type="button" className="till-primary" disabled={unavailable || (method === 'gift_card' && !giftCardCode.trim())} onClick={() => onPay(method, { cashReceivedOverride: method === 'cash' ? Number(cashReceived || total) : null, giftCardCode })}>Pay {selected?.label || method}</button>
    </div>
  </div>
}

function CloudQueueIcon({ count }) {
  return <span className="till-queue-icon"><FileText size={14}/><small>{count}</small></span>
}

function ModifierPicker({ product, groups, onClose, onConfirm }) {
  const [selected, setSelected] = useState([])
  const toggle = (group, option) => {
    setSelected((current) => {
      const groupIds = group.options.map((entry) => entry.id)
      const currentGroup = current.filter((id) => groupIds.includes(id))
      if (currentGroup.includes(option.id)) return current.filter((id) => id !== option.id)
      if (group.maxSelections <= 1) return [...current.filter((id) => !groupIds.includes(id)), option.id]
      if (currentGroup.length >= group.maxSelections) return current
      return [...current, option.id]
    })
  }
  const missingRequired = groups.some((group) => group.required && !group.options.some((option) => selected.includes(option.id)))
  return <Modal title={product.name} onClose={onClose}><div className="till-form"><p>Choose options</p>{groups.map((group) => <section key={group.id} className="till-modifier-group"><strong>{group.name}</strong>{group.options.map((option) => <label key={option.id} className="till-modifier-option"><input type={group.maxSelections > 1 ? 'checkbox' : 'radio'} name={`modifier-${group.id}`} checked={selected.includes(option.id)} onChange={() => toggle(group, option)}/><span>{option.name}</span><small>{Number(option.price || 0) > 0 ? `+${money(option.price)}` : 'Free'}</small></label>)}</section>)}<button type="button" className="till-primary" disabled={missingRequired} onClick={() => onConfirm(selected.map((optionId) => ({ optionId })))}>Add</button></div></Modal>
}

function DiscountForm({ value, onApply }) {
  const [type, setType] = useState(value.type || 'percent')
  const [amount, setAmount] = useState(value.value || '')
  return <div className="till-form"><label>Type<select value={type} onChange={(e) => setType(e.target.value)}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label><label>Value<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="0.01"/></label><button type="button" className="till-primary" onClick={() => onApply({ type, value: Math.max(0, Number(amount || 0)) })}>Apply Discount</button></div>
}

function MiscForm({ vatEnabled, defaultVatRate, onAdd }) {
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [vatRate, setVatRate] = useState(defaultVatRate)
  return <div className="till-form"><label>Description<input value={description} onChange={(e) => setDescription(e.target.value)}/></label><label>Price<input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}/></label><label>Quantity<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)}/></label><label>VAT rate<input type="number" step="0.01" disabled={!vatEnabled} value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}/></label><button type="button" className="till-primary" onClick={() => { if (!description.trim() || Number(price) <= 0 || Number(quantity) <= 0) return; onAdd({ description: description.trim(), price: Number(price), quantity: Number(quantity), vatRate: Number(vatRate) / 100 }) }}>Add to Sale</button></div>
}

function PettyForm({ onSubmit }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  return <div className="till-form"><label>Amount<input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}/></label><label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)}/></label><button type="button" className="till-primary" onClick={() => Number(amount) > 0 && reason.trim() && onSubmit(amount, reason.trim())}>Record Pay Out</button></div>
}

function PriceOverrideForm({ item, onApply }) {
  const [price, setPrice] = useState(item.price)
  const [reason, setReason] = useState('')
  return <div className="till-form"><label>New price<input type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}/></label><label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)}/></label><button type="button" className="till-primary" onClick={() => Number(price) > 0 && onApply(Number(price), reason.trim())}>Apply Price</button></div>
}

function TillSessionPanel({ till, buttons, currency, onChanged, onMessage, onError }) {
  const [openingCash, setOpeningCash] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [reason, setReason] = useState('')
  const meta = buttonMap(buttons)
  const sessionUser = getStoredUser() || {}
  const terminalId = sessionUser.tillId || sessionUser.till_id || sessionUser.terminalId || sessionUser.terminal_id || null
  const userId = sessionUser.id || sessionUser.userId || null

  const open = async () => {
    try {
      if (!terminalId || !userId) throw new Error('A till and user assignment are required.')
      const response = await apiRequest('/api/platform/objects/till_session/records', {
        method: 'POST',
        body: JSON.stringify({ data: {
          terminal_id: terminalId,
          user_id: userId,
          opening_cash: Number(openingCash || 0),
          status: 'open',
        } }),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to open till')
      await onChanged?.(); onMessage?.('Till opened.')
    } catch (err) { onError?.(err?.message || 'Unable to open till') }
  }
  const movement = async (type) => {
    if (!till?.id || Number(cashAmount) <= 0 || !userId) return
    try {
      const response = await apiRequest('/api/platform/objects/cash_ledger/records', {
        method: 'POST',
        body: JSON.stringify({ data: {
          till_session_id: till.id,
          user_id: userId,
          type,
          amount: Number(cashAmount),
          reason: reason || null,
        } }),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to record cash movement')
      setCashAmount(''); setReason(''); await onChanged?.(); onMessage?.('Cash movement recorded.')
    } catch (err) { onError?.(err?.message || 'Unable to record cash movement') }
  }
  const close = async () => {
    try {
      if (!till?.id) return
      const response = await apiRequest(`/api/platform/objects/till_session/records/${encodeURIComponent(till.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ data: {
          status: 'closed',
          closing_cash: Number(countedCash || 0),
          closed_by: userId || null,
          closed_at: new Date().toISOString(),
        } }),
      })
      if (response?.success === false) throw new Error(response?.message || 'Unable to close till')
      await onChanged?.(); onMessage?.('Till closed.')
    } catch (err) { onError?.(err?.message || 'Unable to close till') }
  }

  if (!till) return <div className="till-form"><label>Opening cash<input type="number" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}/></label>{meta.open_till ? <MetaButton button={meta.open_till} onAction={open}/> : null}</div>

  return <div className="till-session-panel"><div className="till-session-stats"><div><span>Opening cash</span><strong>{money(till.opening_cash ?? till.openingCash, currency)}</strong></div><div><span>Cash sales</span><strong>{money(till.cash_sales ?? till.cashSalesTotal, currency)}</strong></div><div><span>Cash in</span><strong>{money(till.cash_in_total ?? till.cashInTotal, currency)}</strong></div><div><span>Cash out</span><strong>{money(till.cash_out_total ?? till.cashOutTotal, currency)}</strong></div></div><div className="till-form is-row"><label>Amount<input type="number" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)}/></label><label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)}/></label>{meta.cash_in ? <MetaButton button={meta.cash_in} onAction={() => movement('cash_in')}/> : null}{meta.cash_out ? <MetaButton button={meta.cash_out} onAction={() => movement('cash_out')}/> : null}</div><div className="till-form is-row"><label>Counted cash<input type="number" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)}/></label>{meta.close_till ? <MetaButton button={meta.close_till} onAction={close}/> : null}</div></div>
}
