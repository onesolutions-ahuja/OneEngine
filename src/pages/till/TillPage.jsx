import { useEffect, useMemo, useState } from 'react'
import {
  BadgePoundSterling,
  Banknote,
  CreditCard,
  FileText,
  HandCoins,
  Minus,
  Pause,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShoppingBag,
  Tag,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { apiRequest } from '../../services/api'

function money(value) {
  return `£${Number(value || 0).toFixed(2)}`
}

function normaliseProduct(product) {
  return {
    id: product.id,
    name: product.name || product.product_name || 'Unnamed Product',
    sku: product.sku || product.code || '',
    barcode: product.barcode || product.ean || '',
    price: Number(product.price ?? product.selling_price ?? product.unit_price ?? 0),
    vatRate: Number(product.vat_rate ?? product.vatRate ?? 20),
    vatApplicable: product.vat_applicable !== undefined ? product.vat_applicable !== false : product.vatApplicable !== false,
    ageRestricted: product.age_restricted === true || product.ageRestricted === true,
    trackStock: product.track_stock !== false && product.trackStock !== false,
    imageUrl: product.image_url || product.imageUrl || '',
    category: product.category || product.category_name || 'Other',
    stock: Number(product.stock_quantity ?? product.stock ?? product.quantity ?? 0),
    active: product.active !== false && product.is_active !== false,
  }
}

function Modal({ title, children, onClose, wide = false }) {
  return (
    <div className="till-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className={`till-modal ${wide ? 'is-wide' : ''}`}>
        <header>
          <strong>{title}</strong>
          <button type="button" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="till-modal-body">{children}</div>
      </section>
    </div>
  )
}

export default function TillPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState(['All'])
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [basket, setBasket] = useState([])
  const [miscLines, setMiscLines] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [discount, setDiscount] = useState({ type: null, value: 0 })
  const [settings, setSettings] = useState(null)
  const [till, setTill] = useState(null)
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

  const loadTill = async () => {
    try {
      const response = await apiRequest('/api/till/sessions/current')
      setTill(response?.success ? response.data || null : null)
    } catch {
      setTill(null)
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [catalogue, settingsResponse] = await Promise.all([
        apiRequest('/api/products/catalogue'),
        apiRequest('/api/settings'),
      ])
      const payload = catalogue?.data || {}
      const rows = Array.isArray(payload.products)
        ? payload.products.map(normaliseProduct).filter((product) => product.active)
        : []
      setProducts(rows)
      const names = [...new Set(rows.map((product) => product.category).filter(Boolean))]
      setCategories(['All', ...names])
      setSettings(settingsResponse?.data || null)
      await loadTill()
    } catch (err) {
      setError(err?.message || 'Unable to load till')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((product) => {
      if (category !== 'All' && product.category !== category) return false
      if (!q) return true
      return [product.name, product.sku, product.barcode].join(' ').toLowerCase().includes(q)
    })
  }, [products, category, search])

  const grossSubtotal = basket.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    + miscLines.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const discountAmount = discount.type === 'percent'
    ? grossSubtotal * Math.min(100, Number(discount.value || 0)) / 100
    : discount.type === 'fixed'
      ? Math.min(grossSubtotal, Number(discount.value || 0))
      : 0
  const subtotal = Math.max(0, grossSubtotal - discountAmount)

  const vatEnabled = settings?.tax?.vatEnabled !== false
  const defaultVatRate = Number(settings?.tax?.defaultVatRate ?? 20) / 100
  const vat = vatEnabled
    ? basket.reduce((sum, item) => {
        const line = Number(item.price) * item.quantity
        const share = grossSubtotal ? discountAmount * (line / grossSubtotal) : 0
        const net = Math.max(0, line - share)
        const rate = item.vatApplicable === false ? 0 : Number(item.vatRate || defaultVatRate * 100) / 100
        return sum + (net - net / (1 + rate))
      }, 0)
    : 0
  const total = subtotal

  const addProduct = (product) => {
    setError('')
    setBasket((current) => {
      const found = current.find((item) => item.id === product.id)
      if (found) {
        if (product.trackStock && found.quantity >= product.stock) {
          setError(`Only ${product.stock} left in stock for ${product.name}.`)
          return current
        }
        return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      if (product.trackStock && product.stock <= 0) {
        setError(`${product.name} is out of stock.`)
        return current
      }
      return [...current, { ...product, quantity: 1 }]
    })
  }

  const changeQty = (id, delta) => {
    setBasket((current) => current
      .map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0))
  }

  const clearSale = () => {
    setBasket([])
    setMiscLines([])
    setSelectedCustomer(null)
    setDiscount({ type: null, value: 0 })
    setMessage('Sale cleared.')
  }

  const holdSale = async () => {
    if (!basket.length && !miscLines.length) return setError('Add an item before holding the sale.')
    setBusy(true)
    try {
      const response = await apiRequest('/api/held-sales', {
        method: 'POST',
        body: JSON.stringify({
          items: basket,
          miscLines,
          customerId: selectedCustomer?.id || null,
          discountType: discount.type,
          discountValue: discount.value,
        }),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to hold sale')
      clearSale()
      setMessage('Sale held successfully.')
    } catch (err) {
      setError(err?.message || 'Unable to hold sale')
    } finally {
      setBusy(false)
    }
  }

  const openHeld = async () => {
    try {
      const response = await apiRequest('/api/held-sales')
      setHeldSales(response?.data || [])
      setModal('held')
    } catch (err) {
      setError(err?.message || 'Unable to load held sales')
    }
  }

  const resumeHeld = async (id) => {
    try {
      const response = await apiRequest(`/api/held-sales/${encodeURIComponent(id)}/resume`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to resume sale')
      const held = response.data || {}
      if (Array.isArray(held.items)) {
        setBasket(held.items)
        setMiscLines([])
      } else {
        setBasket(held.items?.items || [])
        setMiscLines(held.items?.miscLines || [])
      }
      setDiscount({ type: held.discount_type || null, value: Number(held.discount_value || 0) })
      setModal(null)
      setMessage('Held sale resumed.')
    } catch (err) {
      setError(err?.message || 'Unable to resume sale')
    }
  }

  const searchCustomers = async (value) => {
    setCustomerSearch(value)
    if (!value.trim()) return setCustomers([])
    try {
      const response = await apiRequest(`/api/customer-lookup?search=${encodeURIComponent(value.trim())}`)
      setCustomers(response?.data || [])
    } catch {
      setCustomers([])
    }
  }

  const completeCashSale = async () => {
    if (!basket.length && !miscLines.length) return setError('Sale contains no items.')
    if (!till) {
      setModal('till')
      return setError('Open a till session before completing a sale.')
    }
    const received = Number(cashReceived || total)
    if (received < total) return setError('Cash received is less than the sale total.')

    setBusy(true)
    setError('')
    try {
      const id = crypto.randomUUID()
      const items = basket.map((item) => {
        const line = Number(item.price) * item.quantity
        const lineDiscount = grossSubtotal ? discountAmount * (line / grossSubtotal) : 0
        return {
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.price,
          tax: 0,
          discount: lineDiscount,
          total: Math.max(0, line - lineDiscount),
        }
      })
      const response = await apiRequest('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          clientRequestId: id,
          items,
          customerId: selectedCustomer?.id || null,
          miscLines: miscLines.map((line) => ({
            description: line.description,
            price: line.price,
            quantity: line.quantity,
            vatRate: line.vatRate,
          })),
          vatEnabled,
          vatRate: defaultVatRate,
          subtotal,
          tax: vat,
          discount: discountAmount,
          total,
          paymentMethod: 'cash',
          discountType: discount.type,
          discountValue: discount.value,
          ageVerified: basket.some((item) => item.ageRestricted) ? true : undefined,
        }),
      })
      if (!response?.success || !response?.sale?.id) throw new Error(response?.message || 'Sale could not be confirmed')
      setLastSale(response.sale)
      const change = Math.max(0, received - total)
      clearSale()
      setCashReceived('')
      setMessage(`Sale complete${response.sale.receipt_number ? ` · ${response.sale.receipt_number}` : ''} · Change ${money(change)}`)
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to complete sale')
    } finally {
      setBusy(false)
    }
  }

  const openTillSession = async (openingCash) => {
    try {
      const response = await apiRequest('/api/till/sessions', {
        method: 'POST',
        body: JSON.stringify({ openingCash: Number(openingCash || 0) }),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to open till')
      await loadTill()
      setModal(null)
      setMessage('Till opened.')
    } catch (err) {
      setError(err?.message || 'Unable to open till')
    }
  }

  const recordPettyCash = async (amount, reason) => {
    if (!till?.id) return setError('Open a till before recording petty cash.')
    try {
      const response = await apiRequest(`/api/till/sessions/${till.id}/cash-movements`, {
        method: 'POST',
        body: JSON.stringify({ type: 'cash_out', amount: Number(amount), reason: `Petty cash: ${reason}` }),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to record petty cash')
      setModal(null)
      setMessage('Petty cash recorded.')
    } catch (err) {
      setError(err?.message || 'Unable to record petty cash')
    }
  }

  return (
    <section className="till-theme-page">
      <div className="till-theme-window">
        <header className="till-theme-header">
          <div>
            <strong>{settings?.store?.name || 'Till'}</strong>
            <span>{till ? `${till.terminal_name || 'Till'} · Open` : 'Till closed'}</span>
          </div>
          <div className="till-theme-header-actions">
            <button type="button" onClick={() => setModal('till')}><BadgePoundSterling size={15} /> Till</button>
            <button type="button" onClick={() => setModal('customer')}><UserRound size={15} /> {selectedCustomer?.name || 'Customer'}</button>
          </div>
        </header>

        <div className="till-action-bar">
          <button type="button" onClick={holdSale} disabled={busy}><Pause size={15} /> Hold</button>
          <button type="button" onClick={openHeld}><FileText size={15} /> Resume</button>
          <button type="button" onClick={() => setModal('customer')}><UserRound size={15} /> Customer</button>
          <button type="button" onClick={() => setModal('discount')}><Tag size={15} /> Discount</button>
          <button type="button" onClick={clearSale}><X size={15} /> Void</button>
          <button type="button" onClick={() => setModal('misc')}><ShoppingBag size={15} /> Misc Item</button>
          <button type="button" onClick={() => setModal('petty')}><HandCoins size={15} /> Petty Cash</button>
          <button type="button" onClick={() => lastSale && window.print()} disabled={!lastSale}><Printer size={15} /> Print</button>
        </div>

        <div className="till-main-grid">
          <main className="till-catalogue">
            <div className="till-catalogue-tools">
              <label><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or scan barcode" autoFocus /></label>
              <div className="till-categories">
                {categories.map((name) => (
                  <button key={name} type="button" className={category === name ? 'is-active' : ''} onClick={() => setCategory(name)}>{name}</button>
                ))}
              </div>
            </div>

            {error ? <div className="till-notice is-error">{error}</div> : null}
            {message ? <div className="till-notice">{message}</div> : null}

            <div className="till-product-grid">
              {loading ? <div className="till-empty">Loading catalogue…</div> : filtered.map((product) => (
                <button key={product.id} type="button" className="till-product-card" onClick={() => addProduct(product)}>
                  <div className="till-product-image">
                    {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <ShoppingBag size={24} />}
                  </div>
                  <strong>{product.name}</strong>
                  <span>{money(product.price)}</span>
                  {product.trackStock ? <small>{product.stock} in stock</small> : <small>Non-stock</small>}
                </button>
              ))}
              {!loading && !filtered.length ? <div className="till-empty">No products found.</div> : null}
            </div>
          </main>

          <aside className="till-cart">
            <div className="till-cart-head">
              <div><strong>Current Sale</strong><span>{selectedCustomer?.name || 'Walk-in Customer'}</span></div>
              <ReceiptText size={18} />
            </div>

            <div className="till-cart-lines">
              {!basket.length && !miscLines.length ? (
                <div className="till-cart-empty"><ShoppingBag size={32} /><strong>No items</strong><span>Select a product to begin</span></div>
              ) : null}
              {basket.map((item) => (
                <div className="till-cart-line" key={item.id}>
                  <div><strong>{item.name}</strong><small>{money(item.price)} each</small></div>
                  <strong>{money(item.price * item.quantity)}</strong>
                  <div className="till-qty">
                    <button type="button" onClick={() => changeQty(item.id, -1)}><Minus size={12} /></button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => changeQty(item.id, 1)}><Plus size={12} /></button>
                    <button type="button" onClick={() => setBasket((rows) => rows.filter((row) => row.id !== item.id))}><X size={12} /></button>
                  </div>
                </div>
              ))}
              {miscLines.map((line, index) => (
                <div className="till-cart-line" key={`misc-${index}`}>
                  <div><strong>{line.description}</strong><small>Misc Item</small></div>
                  <strong>{money(line.price * line.quantity)}</strong>
                  <button type="button" className="till-remove-misc" onClick={() => setMiscLines((rows) => rows.filter((_, i) => i !== index))}><X size={12} /></button>
                </div>
              ))}
            </div>

            <div className="till-cart-summary">
              <div><span>Subtotal</span><strong>{money(grossSubtotal)}</strong></div>
              {discountAmount > 0 ? <div><span>Discount</span><strong>-{money(discountAmount)}</strong></div> : null}
              <div><span>VAT</span><strong>{money(vat)}</strong></div>
              <div className="is-total"><span>Total</span><strong>{money(total)}</strong></div>
              <label className="till-cash-input"><Banknote size={15} /><input value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} inputMode="decimal" placeholder="Cash received" /></label>
              <div className="till-pay-grid">
                <button type="button" className="till-pay-cash" disabled={busy || (!basket.length && !miscLines.length)} onClick={completeCashSale}><Banknote size={18} /> Cash</button>
                <button type="button" className="till-pay-card" onClick={() => setMessage('Card terminal flow will use the existing One Connect runtime in the next Till migration pass.')}><CreditCard size={18} /> Card</button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {modal === 'discount' ? (
        <Modal title="Discount" onClose={() => setModal(null)}>
          <DiscountForm value={discount} subtotal={grossSubtotal} onApply={(next) => { setDiscount(next); setModal(null) }} />
        </Modal>
      ) : null}

      {modal === 'misc' ? (
        <Modal title="Misc Item" onClose={() => setModal(null)}>
          <MiscForm vatEnabled={vatEnabled} onAdd={(line) => { setMiscLines((rows) => [...rows, line]); setModal(null) }} />
        </Modal>
      ) : null}

      {modal === 'petty' ? (
        <Modal title="Petty Cash" onClose={() => setModal(null)}>
          <PettyForm onSubmit={recordPettyCash} />
        </Modal>
      ) : null}

      {modal === 'customer' ? (
        <Modal title="Select Customer" onClose={() => setModal(null)} wide>
          <label className="till-modal-search"><Search size={15} /><input value={customerSearch} onChange={(e) => searchCustomers(e.target.value)} placeholder="Search name, phone or email" /></label>
          <div className="till-customer-results">
            <button type="button" onClick={() => { setSelectedCustomer(null); setModal(null) }}>Walk-in Customer</button>
            {customers.map((customer) => (
              <button key={customer.id} type="button" onClick={() => { setSelectedCustomer(customer); setModal(null) }}>
                <strong>{customer.name}</strong><span>{customer.phone || customer.email || ''}</span>
              </button>
            ))}
          </div>
        </Modal>
      ) : null}

      {modal === 'held' ? (
        <Modal title="Held Sales" onClose={() => setModal(null)} wide>
          <div className="till-held-list">
            {heldSales.map((sale) => (
              <button key={sale.id} type="button" onClick={() => resumeHeld(sale.id)}>
                <strong>{sale.customer_name || 'Held Sale'}</strong>
                <span>{sale.created_at ? new Date(sale.created_at).toLocaleString() : ''}</span>
              </button>
            ))}
            {!heldSales.length ? <div className="till-empty">No held sales.</div> : null}
          </div>
        </Modal>
      ) : null}

      {modal === 'till' ? (
        <Modal title="Till Session" onClose={() => setModal(null)} wide>
          <TillSessionPanel till={till} onOpen={openTillSession} onChanged={loadTill} onMessage={setMessage} onError={setError} />
        </Modal>
      ) : null}
    </section>
  )
}

function DiscountForm({ value, subtotal, onApply }) {
  const [type, setType] = useState(value.type || 'percent')
  const [amount, setAmount] = useState(value.value || '')
  return (
    <div className="till-form">
      <label>Type<select value={type} onChange={(e) => setType(e.target.value)}><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select></label>
      <label>Value<input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="0" step="0.01" /></label>
      <button type="button" className="till-primary" onClick={() => {
        const n = Math.max(0, Number(amount || 0))
        onApply({ type, value: type === 'percent' ? Math.min(100, n) : Math.min(subtotal, n) })
      }}>Apply Discount</button>
    </div>
  )
}

function MiscForm({ vatEnabled, onAdd }) {
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [vatRate, setVatRate] = useState(20)
  return (
    <div className="till-form">
      <label>Description<input value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label>Price<input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      <label>Quantity<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></label>
      <label>VAT<select disabled={!vatEnabled} value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}><option value="20">20%</option><option value="5">5%</option><option value="0">0%</option></select></label>
      <button type="button" className="till-primary" onClick={() => {
        if (!description.trim() || Number(price) <= 0 || Number(quantity) <= 0) return
        onAdd({ description: description.trim(), price: Number(price), quantity: Number(quantity), vatRate: Number(vatRate) / 100 })
      }}>Add to Sale</button>
    </div>
  )
}

function PettyForm({ onSubmit }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  return (
    <div className="till-form">
      <label>Amount<input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
      <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <button type="button" className="till-primary" onClick={() => Number(amount) > 0 && reason.trim() && onSubmit(amount, reason.trim())}>Record Pay Out</button>
    </div>
  )
}

function TillSessionPanel({ till, onOpen, onChanged, onMessage, onError }) {
  const [openingCash, setOpeningCash] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [cashAmount, setCashAmount] = useState('')
  const [reason, setReason] = useState('')

  const movement = async (type) => {
    if (!till?.id || Number(cashAmount) <= 0) return
    try {
      await apiRequest(`/api/till/sessions/${till.id}/cash-movements`, {
        method: 'POST',
        body: JSON.stringify({ type, amount: Number(cashAmount), reason: reason || null }),
      })
      setCashAmount('')
      setReason('')
      await onChanged?.()
      onMessage?.('Cash movement recorded.')
    } catch (err) {
      onError?.(err?.message || 'Unable to record cash movement')
    }
  }

  const close = async () => {
    try {
      const response = await apiRequest(`/api/till/sessions/${till.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ countedCash: Number(countedCash || 0) }),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to close till')
      await onChanged?.()
      onMessage?.('Till closed.')
    } catch (err) {
      onError?.(err?.message || 'Unable to close till')
    }
  }

  if (!till) {
    return <div className="till-form"><label>Opening cash<input type="number" step="0.01" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} /></label><button type="button" className="till-primary" onClick={() => onOpen(openingCash)}>Open Till</button></div>
  }

  return (
    <div className="till-session-panel">
      <div className="till-session-stats">
        <div><span>Opening cash</span><strong>{money(till.opening_cash)}</strong></div>
        <div><span>Cash sales</span><strong>{money(till.cash_sales)}</strong></div>
        <div><span>Cash in</span><strong>{money(till.cash_in_total)}</strong></div>
        <div><span>Cash out</span><strong>{money(till.cash_out_total)}</strong></div>
      </div>
      <div className="till-form is-row">
        <label>Amount<input type="number" step="0.01" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} /></label>
        <label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="button" onClick={() => movement('cash_in')}>Cash In</button>
        <button type="button" onClick={() => movement('cash_out')}>Cash Out</button>
      </div>
      <div className="till-form is-row">
        <label>Counted cash<input type="number" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} /></label>
        <button type="button" className="till-danger" onClick={close}>Close Till</button>
      </div>
    </div>
  )
}
