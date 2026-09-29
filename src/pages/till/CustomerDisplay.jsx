import { useEffect, useMemo, useState } from 'react'

function money(value, currency = 'GBP') {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0))
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`
  }
}

export default function CustomerDisplay() {
  const [bill, setBill] = useState(null)
  const [receiptQr, setReceiptQr] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (typeof BroadcastChannel !== 'function') return undefined
    const channel = new BroadcastChannel('onepos-customer-display')
    channel.onmessage = (event) => {
      const data = event.data || {}
      if (data.type === 'BILL') {
        setBill(data)
        return
      }
      if (data.type === 'RECEIPT_QR') {
        if (data.active === false || data.cleared === true) setReceiptQr(null)
        else setReceiptQr(data)
      }
    }
    return () => { try { channel.close() } catch {} }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const currency = bill?.currency || 'GBP'
  const hasItems = Array.isArray(bill?.basket) && bill.basket.length > 0
  const seconds = useMemo(() => receiptQr?.expiresAt
    ? Math.max(0, Math.ceil((new Date(receiptQr.expiresAt).getTime() - now) / 1000))
    : null, [receiptQr?.expiresAt, now])

  return (
    <main className="customer-display-page">
      <header className="customer-display-header">
        <div className="customer-display-brand">onePOS</div>
        <div className="customer-display-store">{bill?.storeName || 'Welcome'}</div>
      </header>

      {!hasItems ? (
        <section className="customer-display-welcome">
          <div className="customer-display-logo">one</div>
          <h1>Welcome</h1>
          <p>Your bill will appear here as items are added.</p>
        </section>
      ) : (
        <section className="customer-display-bill">
          <h1>Your bill</h1>
          <div className="customer-display-lines">
            {bill.basket.map((item, index) => (
              <div className="customer-display-line" key={`${item.id || 'item'}-${index}`}>
                <div><strong>{item.name}</strong><span>{item.quantity} × {money(item.price, currency)}</span></div>
                <b>{money(Number(item.price || 0) * Number(item.quantity || 0), currency)}</b>
              </div>
            ))}
          </div>
          <div className="customer-display-totals">
            {bill.hasCustomer ? <div className="customer-display-account">Customer account applied</div> : null}
            <div><span>Subtotal</span><strong>{money(bill.subtotal, currency)}</strong></div>
            {bill.hasDiscount ? <div className="is-discount"><span>Discount</span><strong>−{money(bill.discountAmount, currency)}</strong></div> : null}
            {Number(bill.vat || 0) > 0 ? <div><span>VAT</span><strong>{money(bill.vat, currency)}</strong></div> : null}
            <div className="is-total"><span>Total</span><strong>{money(bill.total, currency)}</strong></div>
          </div>
        </section>
      )}

      {receiptQr ? (
        <div className="customer-display-qr-backdrop">
          <section className="customer-display-qr">
            <button type="button" onClick={() => setReceiptQr(null)} aria-label="Close receipt QR">×</button>
            <small>Receipt {receiptQr.receiptNumber || ''}</small>
            {receiptQr.qrcodeUrl ? <img src={receiptQr.qrcodeUrl} alt="Receipt QR"/> : null}
            <strong>Scan to download your receipt</strong>
            {seconds != null ? <span>{seconds > 0 ? `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Receipt expired'}</span> : null}
          </section>
        </div>
      ) : null}
    </main>
  )
}
