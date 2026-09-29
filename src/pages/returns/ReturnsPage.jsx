import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, History, RefreshCw, Search, ShoppingCart, X } from 'lucide-react'
import { apiRequest, checkBackend } from '../../services/api'

function money(value, currency = 'GBP') {
  const n = Number(value || 0)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

export default function ReturnsPage() {
  const [tab, setTab] = useState('process')
  const [currency, setCurrency] = useState('GBP')

  useEffect(() => {
    let live = true
    apiRequest('/api/settings').catch(() => null).then((response) => {
      if (live) setCurrency(response?.data?.company?.currency || 'GBP')
    })
    return () => { live = false }
  }, [])

  return <section className="module-page returns-page">
    <header className="module-page-header">
      <div><span>Transactions</span><h1>Returns</h1><p>Process customer returns and review return history.</p></div>
      <div className="module-segmented">
        <button type="button" className={tab === 'process' ? 'is-active' : ''} onClick={() => setTab('process')}><ShoppingCart size={13}/> Process return</button>
        <button type="button" className={tab === 'history' ? 'is-active' : ''} onClick={() => setTab('history')}><History size={13}/> Return history</button>
      </div>
    </header>

    {tab === 'process'
      ? <ProcessReturnTab currency={currency} />
      : <ReturnHistoryTab currency={currency} />}
  </section>
}

function ProcessReturnTab({ currency }) {
  const [search, setSearch] = useState('')
  const [lookup, setLookup] = useState(null)
  const [quantities, setQuantities] = useState({})
  const [reason, setReason] = useState('')
  const [step, setStep] = useState('select')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const doLookup = async () => {
    const value = search.trim()
    if (!value || busy) return
    try {
      setBusy(true)
      setError('')
      setResult(null)
      setStep('select')
      const response = await apiRequest(`/api/returns/lookup?receipt=${encodeURIComponent(value)}`)
      if (!response?.success) throw new Error(response?.message || 'Sale not found.')
      if (!response?.data?.sale?.returnable) {
        throw new Error(`This sale cannot be returned (status: ${response?.data?.sale?.status || 'unknown'}).`)
      }
      setLookup(response.data)
      setQuantities({})
      setReason('')
    } catch (err) {
      setLookup(null)
      setError(err?.message || 'Sale not found.')
    } finally {
      setBusy(false)
    }
  }

  const setQuantity = (itemId, value) => {
    const item = lookup?.items?.find((row) => row.id === itemId)
    if (!item) return
    let qty = Number(value)
    if (!Number.isFinite(qty) || qty < 0) qty = 0
    qty = Math.min(qty, Number(item.remainingQuantity || 0))
    setQuantities((current) => ({ ...current, [itemId]: qty }))
  }

  const selectedLines = useMemo(() => {
    if (!lookup) return []
    return (lookup.items || [])
      .map((item) => ({ item, quantity: Number(quantities[item.id] || 0) }))
      .filter((entry) => entry.quantity > 0)
  }, [lookup, quantities])

  const reviewTotal = selectedLines.reduce((sum, entry) => sum + Number(entry.item.unitRefundValue || 0) * entry.quantity, 0)

  const submit = async () => {
    if (!lookup || busy || !selectedLines.length) return
    try {
      setBusy(true)
      setError('')
      const health = await checkBackend().catch(() => null)
      if (!health) throw new Error('Refunds require a connection to the onePOS server. Reconnect and try again — offline refunds are not supported.')

      const response = await apiRequest('/api/returns/customer', {
        method: 'POST',
        body: JSON.stringify({
          saleId: lookup.sale.id,
          items: selectedLines.map(({ item, quantity }) => ({
            saleItemId: item.id,
            productId: item.productId,
            quantity,
          })),
          reason: reason || null,
          requestKey: `return-${lookup.sale.id}-${selectedLines.map((line) => `${line.item.id}:${line.quantity}`).join('_')}`,
        }),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to process the return.')
      setResult(response.data || {})
      setLookup(null)
      setSearch('')
      setQuantities({})
      setReason('')
      setStep('select')
    } catch (err) {
      setError(err?.message || 'Unable to process the return.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="module-stack">
    <section className="module-panel">
      <label className="module-field-label">Find sale by receipt number</label>
      <div className="return-search-row">
        <label className="module-search"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && doLookup()} placeholder="e.g. T01-20260917-0001" /></label>
        <button type="button" className="module-primary-button" onClick={doLookup} disabled={busy || !search.trim()}>{busy ? 'Searching…' : 'Find sale'}</button>
      </div>
      {error ? <div className="module-inline-error">{error}</div> : null}
    </section>

    {result ? <section className="module-success">
      <strong>Return {result.returnNumber} processed successfully.</strong>
      {result.refund?.amount > 0 ? <span>
        Refund recorded: {money(result.refund.amount, currency)}
        {result.refund.allocation?.length > 1
          ? ` · via ${result.refund.allocation.map((part) => `${part.method} ${money(part.amount, currency)}`).join(' + ')}`
          : result.refund.method ? ` · via ${result.refund.method}` : ''}
        {/card/i.test(result.refund.method || '') ? ' · Process the card-terminal refund separately.' : ''}
      </span> : null}
    </section> : null}

    {lookup ? <section className="module-panel return-lookup-card">
      <header className="return-lookup-header">
        <div>
          <strong>Sale {lookup.sale.receiptNumber || lookup.sale.id?.slice(0,8)}</strong>
          <span>{lookup.sale.saleDate ? new Date(lookup.sale.saleDate).toLocaleString() : '—'} · Total {money(lookup.sale.totals?.total, currency)} · Refunded so far {money(lookup.sale.refunded, currency)}</span>
        </div>
        <button type="button" onClick={() => setLookup(null)} aria-label="Clear sale"><X size={14}/></button>
      </header>

      <div className="return-sale-meta">
        <div><span>Customer</span><strong>{lookup.sale.customer?.name || 'Walk-in'}</strong></div>
        <div><span>Payment</span><strong>{lookup.sale.payments?.length ? lookup.sale.payments.map((payment) => `${payment.method} · ${money(payment.amount, currency)}`).join(' + ') : lookup.sale.payment ? `${lookup.sale.payment.method} · ${money(lookup.sale.payment.amount, currency)}` : '—'}</strong></div>
        <div><span>Status</span><strong>{lookup.sale.status || '—'}</strong></div>
      </div>

      {step === 'select' ? <>
        <div className="module-table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Purchased</th><th>Returned</th><th>Remaining</th><th>Refund/unit</th><th>Return qty</th></tr></thead>
            <tbody>{(lookup.items || []).map((item) => <tr key={item.id}>
              <td><strong>{item.productName || item.product_name || item.productId}</strong></td>
              <td>{item.quantity}</td>
              <td>{item.returnedQuantity || 0}</td>
              <td>{item.remainingQuantity}</td>
              <td>{money(item.unitRefundValue, currency)}</td>
              <td><input className="return-qty-input" type="number" min="0" max={item.remainingQuantity} step="0.001" value={quantities[item.id] || ''} onChange={(event) => setQuantity(item.id, event.target.value)} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        <label className="module-textarea-label"><span>Reason (optional)</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label>
        <div className="return-footer"><span>Selected refund: <strong>{money(reviewTotal, currency)}</strong></span><button type="button" className="module-primary-button" disabled={!selectedLines.length} onClick={() => setStep('review')}>Review return</button></div>
      </> : <div className="return-review">
        <h3>Review return</h3>
        <div className="module-table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Refund/unit</th><th>Total</th></tr></thead><tbody>{selectedLines.map(({ item, quantity }) => <tr key={item.id}><td>{item.productName || item.product_name || item.productId}</td><td>{quantity}</td><td>{money(item.unitRefundValue, currency)}</td><td><strong>{money(Number(item.unitRefundValue || 0) * quantity, currency)}</strong></td></tr>)}</tbody></table></div>
        <div className="return-footer"><span>{reason ? <>Reason: <em>{reason}</em> · </> : null}Total refund: <strong>{money(reviewTotal, currency)}</strong></span><div><button type="button" onClick={() => setStep('select')}>Back</button><button type="button" className="module-primary-button" disabled={busy} onClick={submit}>{busy ? 'Processing…' : 'Confirm return'}</button></div></div>
      </div>}
    </section> : null}
  </div>
}

function ReturnHistoryTab({ currency }) {
  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [expanded, setExpanded] = useState('')
  const [detail, setDetail] = useState({})

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiRequest('/api/returns')
      if (!response?.success) throw new Error(response?.message || 'Unable to load returns')
      setReturns(Array.isArray(response.data) ? response.data : [])
    } catch (err) {
      setError(err?.message || 'Unable to load returns')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggleDetail = async (returnId) => {
    if (expanded === returnId) return setExpanded('')
    setExpanded(returnId)
    if (detail[returnId]) return
    try {
      const response = await apiRequest(`/api/returns/${encodeURIComponent(returnId)}`)
      if (response?.success) setDetail((current) => ({ ...current, [returnId]: response.data?.items || [] }))
    } catch {}
  }

  const filtered = returns.filter((row) => {
    const type = row.returnType || row.return_type
    if (typeFilter !== 'ALL' && type !== typeFilter) return false
    if (!search.trim()) return true
    return [row.returnNumber,row.return_number,row.originalInvoice,row.original_invoice,row.customerName,row.customer_name,row.reason]
      .filter(Boolean).join(' ').toLowerCase().includes(search.trim().toLowerCase())
  })

  return <div className="module-stack">
    <section className="module-panel module-filter-row">
      <label className="module-search"><Search size={14}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search return, invoice, customer, reason…" /></label>
      <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">All returns</option><option value="CUSTOMER">Customer returns</option><option value="SUPPLIER">Supplier returns</option></select>
      <button type="button" onClick={load}><RefreshCw size={13}/> Refresh</button>
    </section>

    <section className="module-panel module-table-panel">
      {loading ? <div className="module-state">Loading returns…</div> : error ? <div className="module-state is-error">{error}</div> : !filtered.length ? <div className="module-state">No returns found.</div> : <div className="module-table-wrap no-border">
        <table>
          <thead><tr><th></th><th>Return</th><th>Original invoice</th><th>Date</th><th>Customer</th><th>Items</th><th>Refund</th><th>Status</th><th>Reason</th></tr></thead>
          <tbody>{filtered.map((row) => {
            const type = row.returnType || row.return_type
            const created = row.createdAt || row.created_at
            const rowId = row.id
            return <>
              <tr key={rowId} className="return-history-row" onClick={() => toggleDetail(rowId)}>
                <td>{expanded === rowId ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}</td>
                <td><strong>{row.returnNumber || row.return_number || rowId?.slice(0,8)}</strong></td>
                <td>{row.originalInvoice || row.original_invoice || '—'}</td>
                <td>{created ? new Date(created).toLocaleString() : '—'}</td>
                <td>{row.customerName || row.customer_name || row.supplier_name || '—'}</td>
                <td>{row.itemCount ?? row.item_count ?? '—'}{row.quantity != null ? ` (${row.quantity})` : ''}</td>
                <td>{type === 'CUSTOMER' && (row.refundAmount ?? row.refund_amount) != null ? money(row.refundAmount ?? row.refund_amount, currency) : '—'}</td>
                <td>{row.status || '—'}</td>
                <td>{row.reason || '—'}</td>
              </tr>
              {expanded === rowId ? <tr key={`${rowId}-detail`} className="return-detail-row"><td colSpan={9}>
                {detail[rowId]?.length ? <div className="module-table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Item reason</th></tr></thead><tbody>{detail[rowId].map((item,index) => <tr key={item.id || index}><td>{item.product_name || item.productName || item.productId}</td><td>{item.quantity}</td><td>{item.unit_price != null ? money(item.unit_price, currency) : '—'}</td><td>{item.reason || '—'}</td></tr>)}</tbody></table></div> : <span>Loading items…</span>}
                <small>Processed by {row.createdBy || row.created_by || '—'} · {type === 'CUSTOMER' ? 'Customer return' : 'Supplier return'}{(row.refundMethod || row.refund_method) ? ` · refund via ${row.refundMethod || row.refund_method}` : ''}</small>
              </td></tr> : null}
            </>
          })}</tbody>
        </table>
      </div>}
    </section>
  </div>
}
