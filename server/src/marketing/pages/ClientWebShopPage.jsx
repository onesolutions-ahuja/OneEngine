import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Check, LoaderCircle, Minus, Plus, Search, ShoppingBag, Store, Truck } from "lucide-react";
import "./ClientWebShopPage.css";

const money = (value, currency = "GBP") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value || 0));

export default function ClientWebShopPage() {
  const { slug } = useParams();
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All items");
  const [cart, setCart] = useState({});
  const [quote, setQuote] = useState(null);
  const [fulfilmentType, setFulfilmentType] = useState("SELF_PICKUP");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "" });
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/client-web-shop/public/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || "Shop is unavailable");
        if (active) {
          setCatalog(result.data);
          const firstPayment = result.data.shop.paymentOptions?.[0]?.code;
          if (firstPayment) setPaymentMethod(firstPayment);
          if (!result.data.shop.fulfilment.pickup && result.data.shop.fulfilment.delivery) setFulfilmentType("DELIVERY");
        }
      })
      .catch((error) => { if (active) setCatalogError(error.message); });
    return () => { active = false; };
  }, [slug]);

  const quantities = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
  useEffect(() => {
    if (!catalog || !quantities.length) {
      setQuote(null);
      return undefined;
    }
    const controller = new AbortController();
    fetch(`/api/client-web-shop/public/${encodeURIComponent(slug)}/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: quantities, fulfilmentType }),
      signal: controller.signal,
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to calculate basket");
      setQuote(result.data);
      setMessage("");
    }).catch((error) => {
      if (error.name !== "AbortError") {
        setQuote(null);
        setMessage(error.message);
      }
    });
    return () => controller.abort();
  }, [catalog, cart, fulfilmentType, slug]);

  const products = useMemo(() => (catalog?.products || []).filter((product) => {
    const matchesSearch = `${product.name} ${product.description}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (category === "All items" || product.category === category);
  }), [catalog, search, category]);
  const itemCount = quantities.reduce((sum, item) => sum + item.quantity, 0);
  const currency = catalog?.shop?.currency || "GBP";
  const checkoutPaymentOptions = (catalog?.shop?.paymentOptions || []).filter((option) => option.fulfilmentType === "ANY" || option.fulfilmentType === fulfilmentType);

  useEffect(() => {
    if (checkoutPaymentOptions.length && !checkoutPaymentOptions.some((option) => option.code === paymentMethod)) {
      setPaymentMethod(checkoutPaymentOptions[0].code);
    }
  }, [checkoutPaymentOptions, paymentMethod]);

  function changeQuantity(product, delta) {
    if (!product.available && delta > 0) return;
    setCart((previous) => {
      const quantity = Math.max(0, Math.min(99, Number(previous[product.id] || 0) + delta));
      const next = { ...previous };
      if (quantity) next[product.id] = quantity;
      else delete next[product.id];
      return next;
    });
  }

  async function submitOrder(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/client-web-shop/public/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ items: quantities, customer, notes, fulfilmentType, paymentMethod }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || "Unable to submit order");
      setConfirmation(result.data);
      setCart({});
      setCheckoutOpen(false);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (catalogError) return <main className="shop-page shop-message"><div><Store size={28} /><h1>Shop unavailable</h1><p>{catalogError}</p></div></main>;
  if (!catalog) return <main className="shop-page shop-message"><LoaderCircle className="shop-spinner" size={30} aria-label="Loading shop" /></main>;
  if (confirmation) return (
    <main className="shop-page shop-message">
      <section className="shop-confirmation" aria-live="polite">
        <span className="shop-confirmation-icon"><Check size={28} /></span>
        <p className="shop-kicker">Order received</p>
        <h1>Thank you, {customer.name.split(" ")[0]}.</h1>
        <p>Your order is with {catalog.shop.name}.</p>
        <dl><div><dt>Reference</dt><dd>{confirmation.reference}</dd></div><div><dt>Total</dt><dd>{money(confirmation.total, currency)}</dd></div><div><dt>Fulfilment</dt><dd>{confirmation.fulfilmentType === "DELIVERY" ? "Delivery" : "Pickup"}</dd></div></dl>
        <p className="shop-payment-note">{confirmation.paymentStatus === "paid" ? "Sandbox payment approved." : `Payment is arranged at ${fulfilmentType === "DELIVERY" || fulfilmentType === "OWN_DELIVERY" ? "delivery" : "pickup"}.`}</p>
        {confirmation.trackingPath && <a className="shop-checkout-button shop-track-link" href={confirmation.trackingPath}>Track your order <ArrowRight size={18} /></a>}
      </section>
    </main>
  );

  const categories = ["All items", ...new Set(catalog.products.map((product) => product.category).filter(Boolean))];
  return (
    <main className="shop-page">
      <header className="shop-header">
        <a className="shop-brand" href={`/shop/${encodeURIComponent(slug)}`}>
          {catalog.shop.logoUrl ? <img src={catalog.shop.logoUrl} alt="" /> : <span className="shop-brand-mark"><Store size={19} /></span>}
          <span><strong>{catalog.shop.name}</strong><small>{catalog.shop.storeName}</small></span>
        </a>
        <a className="shop-cart-link" href="#basket"><ShoppingBag size={18} /><span>Basket</span><b>{itemCount}</b></a>
      </header>

      <section className="shop-intro">
        <div><p className="shop-kicker">{catalog.shop.storeName}</p><h1>Good things,<br />ready when you are.</h1><p>Browse the collection and choose pickup or local delivery at checkout.</p></div>
        {catalog.shop.logoUrl && <img className="shop-hero-image" src={catalog.shop.logoUrl} alt="" />}
      </section>

      <div className="shop-layout">
        <section className="shop-catalogue" aria-label="Product catalogue">
          <div className="shop-toolbar">
            <label className="shop-search"><Search size={17} /><span className="sr-only">Search products</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the shop" /></label>
            <div className="shop-categories" aria-label="Product categories">
              {categories.map((item) => <button key={item} type="button" className={category === item ? "selected" : ""} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
          </div>
          {products.length ? <div className="shop-products">{products.map((product) => {
            const quantity = Number(cart[product.id] || 0);
            return <article className={`shop-product${product.available ? "" : " unavailable"}`} key={product.id}>
              <div className="shop-product-image">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span><ShoppingBag size={24} /></span>}{!product.available && <b>Unavailable</b>}</div>
              <div className="shop-product-body">
                <div className="shop-product-category">{product.category || "Shop"}</div>
                <h2>{product.name}</h2>
                {product.description && <p>{product.description}</p>}
                {Object.keys(product.variantAttributes || {}).length > 0 && <small>{Object.entries(product.variantAttributes).map(([key, value]) => `${key}: ${value}`).join(" · ")}</small>}
                <div className="shop-product-bottom"><strong>{money(product.price, currency)}</strong>
                  {quantity ? <div className="shop-quantity"><button type="button" aria-label={`Remove one ${product.name}`} onClick={() => changeQuantity(product, -1)}><Minus size={16} /></button><span>{quantity}</span><button type="button" aria-label={`Add one ${product.name}`} disabled={!product.available || quantity >= 99} onClick={() => changeQuantity(product, 1)}><Plus size={16} /></button></div>
                    : <button type="button" className="shop-add" aria-label={`Add ${product.name} to basket`} disabled={!product.available} onClick={() => changeQuantity(product, 1)}><Plus size={17} /><span>Add</span></button>}
                </div>
              </div>
            </article>;
          })}</div> : <p className="shop-empty">No products match this view.</p>}
        </section>

        <aside className="shop-basket" id="basket" aria-label="Basket">
          <div className="shop-basket-heading"><div><p className="shop-kicker">Your order</p><h2>Basket <span>{itemCount}</span></h2></div><ShoppingBag size={21} /></div>
          {quote?.lines?.length ? <>
            <div className="shop-basket-lines">{quote.lines.map((line) => <div className="shop-basket-line" key={line.productId}><div><strong>{line.name}</strong><small>{line.quantity} × {money(line.unitPrice, currency)}</small></div><b>{money(line.subtotal, currency)}</b><button type="button" aria-label={`Remove ${line.name}`} onClick={() => setCart((current) => { const next = { ...current }; delete next[line.productId]; return next; })}><Minus size={14} /></button></div>)}</div>
            <div className="shop-totals"><div><span>Subtotal</span><b>{money(quote.subtotal, currency)}</b></div><div><span>VAT</span><b>{money(quote.tax, currency)}</b></div>{fulfilmentType === "DELIVERY" && <div><span>Delivery</span><b>{money(quote.deliveryFee, currency)}</b></div>}<div className="shop-total"><span>Total</span><b>{money(quote.total, currency)}</b></div></div>
            <button type="button" className="shop-checkout-button" onClick={() => { setCheckoutOpen(true); setMessage(""); }}>Checkout <ArrowRight size={18} /></button>
          </> : <div className="shop-basket-empty"><ShoppingBag size={27} /><p>Your basket is empty.</p><small>Add something from the collection to get started.</small></div>}
          {message && <p className="shop-error" role="alert">{message}</p>}
          <div className="shop-fulfilment-note"><Truck size={15} /><span>{catalog.shop.fulfilment.delivery ? "Delivery" : "Pickup"} available from {catalog.shop.storeName}</span></div>
        </aside>
      </div>

      {checkoutOpen && <div className="shop-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckoutOpen(false); }}>
        <section className="shop-checkout" role="dialog" aria-modal="true" aria-labelledby="shop-checkout-title">
          <button type="button" className="shop-modal-close" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)}>×</button>
          <p className="shop-kicker">Almost there</p><h2 id="shop-checkout-title">Your details</h2>
          <form onSubmit={submitOrder}>
            <fieldset className="shop-fulfilment-choice"><legend>How would you like your order?</legend>
              {catalog.shop.fulfilment.pickup && <label><input type="radio" name="fulfilment" checked={fulfilmentType === "SELF_PICKUP"} onChange={() => setFulfilmentType("SELF_PICKUP")} /><Store size={17} />Pickup</label>}
              {catalog.shop.fulfilment.delivery && <label><input type="radio" name="fulfilment" checked={fulfilmentType === "DELIVERY"} onChange={() => setFulfilmentType("DELIVERY")} /><Truck size={17} />Delivery</label>}
            </fieldset>
            <fieldset className="shop-fulfilment-choice"><legend>Payment</legend>
              {checkoutPaymentOptions.map((option) => <label key={option.code}><input type="radio" name="paymentMethod" checked={paymentMethod === option.code} onChange={() => setPaymentMethod(option.code)} />{option.label}</label>)}
            </fieldset>
            <div className="shop-form-grid">
              <label>Name<input required maxLength={200} autoComplete="name" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
              <label>Phone<input required maxLength={50} autoComplete="tel" inputMode="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label>
              <label>Email <span>(optional)</span><input type="email" maxLength={255} autoComplete="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
              {fulfilmentType === "DELIVERY" && <label className="shop-address-field">Delivery address<textarea required maxLength={500} autoComplete="street-address" rows="3" value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} /></label>}
              <label className="shop-address-field">Order notes <span>(optional)</span><textarea maxLength={1000} rows="2" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            </div>
            <div className="shop-checkout-total"><span>{paymentMethod === "sandbox_card" ? "Pay now (sandbox)" : `Due at ${fulfilmentType === "DELIVERY" || fulfilmentType === "OWN_DELIVERY" ? "delivery" : "pickup"}`}</span><strong>{money(quote?.total, currency)}</strong></div>
            {message && <p className="shop-error" role="alert">{message}</p>}
            <button className="shop-checkout-button" type="submit" disabled={busy || !quote || !checkoutPaymentOptions.some((option) => option.code === paymentMethod)}>{busy ? <><LoaderCircle className="shop-spinner" size={18} />Submitting</> : <>Place order <ArrowRight size={18} /></>}</button>
          </form>
        </section>
      </div>}
    </main>
  );
}