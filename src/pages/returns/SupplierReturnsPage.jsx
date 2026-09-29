import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { apiRequest, checkBackend } from '../../services/api'

function money(value, currency = 'GBP') {
  const n = Number(value || 0)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

export default function SupplierReturnsPage() {
  const [lines, setLines] = useState([])
  const [returns, setReturns] = useState([])
  const [currency, setCurrency] = useState('GBP')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const [available, history, settings] = await Promise.all([
        apiRequest('/api/supplier-returns/available'),
        apiRequest('/api/returns'),
        apiRequest('/api/settings').catch(() => null),
      ])
      if (!available?.success) throw new Error(available?.message || 'Unable to load supplier returns')
      setLines(Array.isArray(available.data) ? available.data : [])
      setReturns((Array.isArray(history?.data) ? history.data : []).filter((item) => (item.return_type || item.returnType) === 'SUPPLIER'))
      setCurrency(settings?.data?.company?.currency || 'GBP')
    } catch (err) {
      setError(err?.message || 'Unable to load supplier returns')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const submit = async (event) => {
    event.preventDefault()
    const amount = Number(quantity)
    if (!selected || !Number.isFinite(amount) || amount <= 0 || amount > Number(selected.remaining_quantity || 0)) {
      setError('Enter a valid quantity within the remaining returnable quantity.')
      return
    }
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const health = await checkBackend().catch(() => null)
      if (!health) throw new Error('Supplier returns require a connection to the onePOS server.')
      const response = await apiRequest('/api/returns/supplier', {
        method: 'POST',
        body: JSON.stringify({
          purchaseId: selected.purchase_id,
          items: [{
            purchaseItemId: selected.purchase_item_id,
            productId: selected.product_id,
            quantity: amount,
          }],
          reason: reason || null,
          requestKey: `supplier-return-${selected.purchase_item_id}-${Date.now()}`,
        }),
      })
      if (!response?.success) throw new Error(response?.message || 'Unable to process supplier return')
      setMessage('Supplier return processed.')
      setSelected(null)
      setQuantity('')
      setReason('')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to process supplier return')
    } finally {
      setSaving(false)
    }
  }

  return <section className="module-page supplier-returns-page">
    <header className="module-page-header">
      <div><span>Purchasing</span><h1>Supplier Returns</h1><p>Return received stock through the inventory ledger.</p></div>
      <button type="button" onClick={load}><RefreshCw size={14}/> Refresh</button>
    </header>

    {message ? <div className="module-success module-page-message"><strong>{message}</strong></div> : null}
    {error ? <div className="module-inline-error module-page-message">{error}</div> : null}

    <section className="module-page-card">
      {loading ? <div className="module-state">Loading supplier returns…</div> : !lines.length ? <div className="module-state">No received stock is currently available to return.</div> : <div className="module-table-wrap no-border">
        <table>
          <thead><tr><th>Purchase</th><th>Supplier</th><th>Product</th><th>Received</th><th>Returned</th><th>Remaining</th><th>Action</th></tr></thead>
          <tbody>{lines.map((line) => <tr key={line.purchase_item_id}>
            <td>{line.reference_number || line.purchase_id?.slice(0,8)}</td>
            <td>{line.supplier_name || '—'}</td>
            <td><strong>{line.product_name || line.product_id}</strong></td>
            <td>{line.received_quantity}</td>
            <td>{line.returned_quantity}</td>
            <td><strong>{line.remaining_quantity}</strong></td>
            <td>{Number(line.remaining_quantity || 0) > 0
              ? <button type="button" className="module-table-action" onClick={() => { setSelected(line); setQuantity(''); setReason(''); setError('') }}>Return stock</button>
              : <span className="module-muted">Fully returned</span>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <section className="module-page-card supplier-return-history">
      <header className="module-card-header"><strong>Return history</strong><span>{returns.length} supplier returns</span></header>
      {!returns.length ? <div className="module-state">No supplier returns recorded.</div> : <div className="module-table-wrap no-border">
        <table>
          <thead><tr><th>Purchase</th><th>Supplier</th><th>Reason</th><th>Date</th><th>Created by</th></tr></thead>
          <tbody>{returns.map((item) => <tr key={item.id}>
            <td>{item.originalInvoice || item.original_invoice || item.reference_number || item.purchase_id?.slice(0,8) || '—'}</td>
            <td>{item.customerName || item.customer_name || item.supplier_name || '—'}</td>
            <td>{item.reason || '—'}</td>
            <td>{item.createdAt || item.created_at ? new Date(item.createdAt || item.created_at).toLocaleString() : '—'}</td>
            <td>{item.createdBy || item.created_by || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    {selected ? <div className="module-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
      <form className="module-modal supplier-return-modal" onSubmit={submit}>
        <header>
          <div><strong>Return Stock</strong><span>{selected.product_name} · remaining {selected.remaining_quantity}</span></div>
          <button type="button" onClick={() => setSelected(null)} aria-label="Close"><X size={16}/></button>
        </header>
        <div className="module-modal-body">
          <label className="module-input-label"><span>Return quantity</span><input required type="number" min="0.001" max={selected.remaining_quantity} step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <label className="module-textarea-label"><span>Reason</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></label>
          <div className="supplier-return-summary"><span>Purchase</span><strong>{selected.reference_number || selected.purchase_id?.slice(0,8)}</strong><span>Supplier</span><strong>{selected.supplier_name || '—'}</strong>{selected.unit_price != null ? <><span>Unit price</span><strong>{money(selected.unit_price, currency)}</strong></> : null}</div>
        </div>
        <footer className="module-modal-footer"><button type="button" onClick={() => setSelected(null)}>Cancel</button><button type="submit" className="module-primary-button" disabled={saving}>{saving ? 'Processing…' : 'Confirm return'}</button></footer>
      </form>
    </div> : null}
  </section>
}
