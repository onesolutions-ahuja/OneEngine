import { useEffect, useState } from 'react'
import { apiRequest, apiUrl } from '../../services/api'

const EMPTY = {
  enabled: false,
  slug: '',
  name: '',
  storeId: '',
  priceListId: '',
  pickupEnabled: true,
  deliveryEnabled: false,
  ownDeliveryEnabled: false,
  sandboxPaymentsEnabled: false,
  minimumOrder: '0',
  deliveryFee: '0',
}

export default function ClientWebShopSettings() {
  const [form, setForm] = useState(EMPTY)
  const [stores, setStores] = useState([])
  const [priceLists, setPriceLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [slug, setSlug] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await apiRequest('/api/settings/client-web-shop')
      const data = response?.data || {}
      setForm({
        enabled: data.client_web_shop_enabled === true,
        slug: data.client_web_shop_slug || '',
        name: data.client_web_shop_name || '',
        storeId: data.client_web_shop_store_id || '',
        priceListId: data.client_web_shop_price_list_id || '',
        pickupEnabled: data.client_web_shop_pickup_enabled !== false,
        deliveryEnabled: data.client_web_shop_delivery_enabled === true,
        ownDeliveryEnabled: data.client_web_shop_own_delivery_enabled === true,
        sandboxPaymentsEnabled: data.client_web_shop_sandbox_payments_enabled === true,
        minimumOrder: String(data.client_web_shop_minimum_order || 0),
        deliveryFee: String(data.client_web_shop_delivery_fee || 0),
      })
      setStores(Array.isArray(data.stores) ? data.stores : [])
      setPriceLists(Array.isArray(data.priceLists) ? data.priceLists : [])
      setSlug(data.client_web_shop_slug || '')
    } catch (err) {
      setError(err?.message || 'Unable to load shop settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const save = async () => {
    try {
      setSaving(true)
      setError('')
      setMessage('')
      const response = await apiRequest('/api/settings/client-web-shop', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          priceListId: form.priceListId || null,
          minimumOrder: Number(form.minimumOrder),
          deliveryFee: Number(form.deliveryFee),
        }),
      })
      setSlug(response?.data?.slug || form.slug)
      setMessage('Client Web Shop settings saved.')
      await load()
    } catch (err) {
      setError(err?.message || 'Unable to save shop settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="settings-state-card">Loading Client Web Shop settings…</div>

  return (
    <div>
      {error ? <div className="settings-error">{error}</div> : null}
      {message ? <div className="settings-success">{message}</div> : null}

      <div className="settings-row">
        <div><strong>Shop enabled</strong><p>Publishes the company storefront while its package/licence is active.</p></div>
        <button type="button" className={`mac-switch ${form.enabled ? 'is-on' : ''}`} onClick={() => update('enabled', !form.enabled)}><span /></button>
      </div>

      <div className="settings-row">
        <div><strong>Public shop URL slug</strong><p>Lowercase letters, numbers and hyphens.</p></div>
        <input value={form.slug} maxLength={100} onChange={(event) => update('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="your-shop-name" />
      </div>

      <div className="settings-row">
        <div><strong>Public shop name</strong><p>Shown to customers; defaults to the company name.</p></div>
        <input value={form.name} maxLength={200} onChange={(event) => update('name', event.target.value)} placeholder="Company name" />
      </div>

      <div className="settings-row">
        <div><strong>Fulfilment store</strong><p>Catalogue stock and order reservation use this store.</p></div>
        <select value={form.storeId} onChange={(event) => update('storeId', event.target.value)}>
          <option value="">Select a store</option>
          {stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}
        </select>
      </div>

      <div className="settings-row">
        <div><strong>Price list</strong><p>Optional active price list; scheduled prices/promotions remain canonical.</p></div>
        <select value={form.priceListId} onChange={(event) => update('priceListId', event.target.value)}>
          <option value="">Use product pricing</option>
          {priceLists.map((list) => <option value={list.id} key={list.id}>{list.name}</option>)}
        </select>
      </div>

      <div className="settings-row">
        <div><strong>Pickup enabled</strong><p>Allow customers to collect orders from the fulfilment store.</p></div>
        <button type="button" className={`mac-switch ${form.pickupEnabled ? 'is-on' : ''}`} onClick={() => update('pickupEnabled', !form.pickupEnabled)}><span /></button>
      </div>

      <div className="settings-row">
        <div><strong>Delivery enabled</strong><p>Allow delivery during checkout.</p></div>
        <button type="button" className={`mac-switch ${form.deliveryEnabled ? 'is-on' : ''}`} onClick={() => update('deliveryEnabled', !form.deliveryEnabled)}><span /></button>
      </div>

      {form.deliveryEnabled ? (
        <>
          <div className="settings-row">
            <div><strong>Use own delivery team</strong><p>Requires the separately installed/licensed Own Delivery package.</p></div>
            <button type="button" className={`mac-switch ${form.ownDeliveryEnabled ? 'is-on' : ''}`} onClick={() => update('ownDeliveryEnabled', !form.ownDeliveryEnabled)}><span /></button>
          </div>
          <div className="settings-row">
            <div><strong>Delivery charge</strong><p>Charge added to delivery orders.</p></div>
            <input type="number" min="0" step="0.01" value={form.deliveryFee} onChange={(event) => update('deliveryFee', event.target.value)} />
          </div>
          <div className="settings-row">
            <div><strong>Minimum order</strong><p>Minimum basket total required for checkout.</p></div>
            <input type="number" min="0" step="0.01" value={form.minimumOrder} onChange={(event) => update('minimumOrder', event.target.value)} />
          </div>
        </>
      ) : null}

      <div className="settings-row">
        <div><strong>Sandbox card payments</strong><p>Uses Payment Core sandbox only; this does not configure a live card provider.</p></div>
        <button type="button" className={`mac-switch ${form.sandboxPaymentsEnabled ? 'is-on' : ''}`} onClick={() => update('sandboxPaymentsEnabled', !form.sandboxPaymentsEnabled)}><span /></button>
      </div>

      <div className="settings-row">
        <div><strong>Save shop configuration</strong><p>Disabling the package/licence hides the shop without deleting its settings or orders.</p></div>
        <button type="button" className="settings-secondary-button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save shop settings'}</button>
      </div>

      {slug ? (
        <div className="settings-row">
          <div><strong>Public URL</strong><p>Open the customer storefront.</p></div>
          <a href={apiUrl(`/shop/${encodeURIComponent(slug)}`)} target="_blank" rel="noreferrer">/shop/{slug}</a>
        </div>
      ) : null}
    </div>
  )
}
