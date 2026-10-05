import { useState } from 'react'
import { Mail, MessageCircle, Smartphone, X } from 'lucide-react'
import { apiRequest } from '../../services/api'
import WorkspacePage from '../workspace/WorkspacePage.jsx'

function money(value, currency = 'GBP') {
  const n = Number(value || 0)
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

export default function SalesPage({ onOpenReturns, onOpenSupplierReturns }) {
  return <div className="sales-workspace-runtime">
    {onOpenReturns || onOpenSupplierReturns ? <div className="module-header-actions sales-runtime-shortcuts">
      {onOpenReturns ? <button type="button" onClick={onOpenReturns}>Customer Returns</button> : null}
      {onOpenSupplierReturns ? <button type="button" onClick={onOpenSupplierReturns}>Supplier Returns</button> : null}
    </div> : null}
    <WorkspacePage initialObjectKey="sale" appKey="sales" />
  </div>
}

export function SaleDetail({ sale, currency, onClose }) {
  const [channelState, setChannelState] = useState({ channel: '', phase: 'idle', message: '' })

  const beginOrSend = async (channel) => {
    if (channelState.channel !== channel || channelState.phase !== 'confirm') {
      setChannelState({ channel, phase: 'confirm', message: '' })
      return
    }
    try {
      setChannelState({ channel, phase: 'sending', message: '' })
      let response
      if (channel === 'whatsapp') {
        response = await apiRequest('/api/whatsapp/resend-invoice', {
          method: 'POST',
          body: JSON.stringify({ saleId: sale.id }),
        })
      } else {
        response = await apiRequest(`/api/invoice-delivery/${channel}/resend`, {
          method: 'POST',
          body: JSON.stringify({ saleId: sale.id }),
        })
      }
      if (!response?.success) throw new Error(response?.message || 'Send failed')
      const message = channel === 'whatsapp'
        ? response?.data?.mode === 'pdf' ? 'Sent as PDF receipt.' : 'Sent as secure invoice link.'
        : response?.message || 'Invoice sent.'
      setChannelState({ channel, phase: 'sent', message })
    } catch (err) {
      setChannelState({ channel, phase: 'failed', message: err?.message || 'Send failed' })
    }
  }

  const sendAction = (channel, label, Icon) => {
    const state = channelState.channel === channel ? channelState : { phase: 'idle', message: '' }
    if (state.phase === 'confirm') {
      return <div className="sale-send-confirm" key={channel}>
        <span>Send this invoice by {label}?</span>
        <button type="button" onClick={() => beginOrSend(channel)}>Yes, send</button>
        <button type="button" onClick={() => setChannelState({ channel: '', phase: 'idle', message: '' })}>Cancel</button>
      </div>
    }
    if (state.phase === 'sent') return <div className="sale-send-result is-success" key={channel}>✓ {label}: {state.message}</div>
    if (state.phase === 'failed') return <div className="sale-send-result is-error" key={channel}>✕ {state.message} <button type="button" onClick={() => setChannelState({ channel, phase: 'confirm', message: '' })}>Try again</button></div>
    return <button type="button" className="sale-channel-button" onClick={() => beginOrSend(channel)} key={channel}><Icon size={13}/> Send by {label}</button>
  }

  return <div className="module-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="module-modal sale-detail-modal" role="dialog" aria-modal="true" aria-label="Sale details">
      <header>
        <div><strong>Sale {sale.receipt_number || sale.id?.slice(0,8)}</strong><span>{sale.created_at ? new Date(sale.created_at).toLocaleString() : '—'} · {sale.store_name || '—'}</span></div>
        <button type="button" onClick={onClose} aria-label="Close"><X size={16}/></button>
      </header>
      <div className="module-modal-body">
        <div className="sale-summary-grid">
          <div><span>Customer</span><strong>{sale.customer_name || 'Walk-in Customer'}</strong></div>
          <div><span>Cashier</span><strong>{sale.cashier || '—'}</strong></div>
          <div><span>Status</span><strong>{sale.status || '—'}</strong></div>
          <div><span>Payment</span><strong>{sale.payment_method || '—'} · {money(sale.payment_amount, currency)}</strong></div>
        </div>

        <div className="module-table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Quantity</th><th>Unit price</th><th>Line total</th></tr></thead>
            <tbody>{(sale.items || []).map((item) => <tr key={item.id}><td>{item.product_name}</td><td>{item.quantity}</td><td>{money(item.unit_price, currency)}</td><td><strong>{money(item.total, currency)}</strong></td></tr>)}</tbody>
          </table>
        </div>

        <div className="sale-totals">
          <span>Subtotal {money(sale.subtotal, currency)}</span>
          <span>VAT {money(sale.tax, currency)}</span>
          <span>Discount {money(sale.discount, currency)}</span>
          <strong>Total {money(sale.total, currency)}</strong>
        </div>

        <div className="sale-delivery-actions">
          <div><strong>Send invoice</strong><span>Uses the customer's stored contact details and the configured delivery channel.</span></div>
          <div className="sale-channel-actions">
            {sendAction('sms', 'SMS', Smartphone)}
            {sendAction('email', 'Email', Mail)}
            {sendAction('whatsapp', 'WhatsApp', MessageCircle)}
          </div>
        </div>
      </div>
    </section>
  </div>
}

