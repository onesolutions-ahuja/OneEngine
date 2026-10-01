import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { apiRequest } from "../../services/api.js";
import "./oneKiosk.css";

function money(value, currency = "GBP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function OneKioskPage() {
  const [products, setProducts] = useState([]);
  const [currency, setCurrency] = useState("GBP");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [basket, setBasket] = useState([]);
  const [fulfilmentType, setFulfilmentType] = useState("COLLECT");
  const [paying, setPaying] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [paidSale, setPaidSale] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      apiRequest("/api/products"),
      apiRequest("/api/settings").catch(() => null),
    ])
      .then(([productResponse, settingsResponse]) => {
        if (!live) return;
        if (!productResponse?.success) throw new Error(productResponse?.message || "Unable to load kiosk catalogue");
        const rows = (Array.isArray(productResponse.data) ? productResponse.data : [])
          .filter((product) => product?.active !== false)
          .map((product) => ({
            ...product,
            categoryLabel: product.category_name || product.category || "Other",
          }));
        setProducts(rows);
        setCurrency(settingsResponse?.data?.company?.currency || settingsResponse?.company?.currency || "GBP");
      })
      .catch((reason) => {
        if (live) setError(reason?.message || "Unable to load OneKiosk");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => { live = false; };
  }, []);

  const categories = useMemo(
    () => ["All", ...new Set(products.map((product) => product.categoryLabel).filter(Boolean))],
    [products]
  );

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (category !== "All" && product.categoryLabel !== category) return false;
      if (!query) return true;
      return [product.name, product.sku, product.barcode, product.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [products, category, search]);

  const total = basket.reduce((sum, line) => sum + Number(line.price || 0) * Number(line.quantity || 0), 0);
  const itemCount = basket.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  const add = (product) => {
    setBasket((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) => line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  };

  const changeQuantity = (productId, delta) => {
    setBasket((current) => current
      .map((line) => line.id === productId ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line)
      .filter((line) => line.quantity > 0));
  };

  const createFulfilmentFromPaidSale = async (sale) => {
    const fulfilment = await apiRequest("/api/kiosk/orders/from-sale", {
      method: "POST",
      body: JSON.stringify({ saleId: sale.id, fulfilmentType }),
    });
    if (!fulfilment?.success) {
      throw new Error(fulfilment?.message || "Payment succeeded, but the collection order could not be created");
    }
    setConfirmation({
      ...(fulfilment.data || {}),
      total: sale.total,
    });
    setPaidSale(null);
    setBasket([]);
    setSearch("");
    setCategory("All");
  };

  const payAndCollect = async () => {
    if (!basket.length || paying) return;
    setPaying(true);
    setError("");
    try {
      if (paidSale?.id) {
        await createFulfilmentFromPaidSale(paidSale);
        return;
      }

      const capability = await apiRequest("/api/connector-capabilities/payment.sale");
      if (capability?.data?.available !== true) {
        throw new Error(capability?.message || "No healthy card payment connector is assigned to this kiosk");
      }

      const clientRequestId = crypto.randomUUID();
      const saleResponse = await apiRequest("/api/sales", {
        method: "POST",
        body: JSON.stringify({
          clientRequestId,
          items: basket.map((line) => ({
            productId: line.id,
            quantity: Number(line.quantity) || 1,
            unitPrice: Number(line.price) || 0,
            discount: 0,
            tax: 0,
            total: (Number(line.price) || 0) * (Number(line.quantity) || 1),
          })),
          subtotal: total,
          tax: 0,
          discount: 0,
          total,
          paymentMethod: "card",
        }),
      });

      if (!saleResponse?.success || !saleResponse?.sale?.id) {
        throw new Error(saleResponse?.message || "Card payment could not be completed");
      }

      setPaidSale(saleResponse.sale);
      await createFulfilmentFromPaidSale(saleResponse.sale);
    } catch (reason) {
      setError(reason?.message || "Unable to complete payment");
    } finally {
      setPaying(false);
    }
  };

  const startNewOrder = () => {
    setConfirmation(null);
    setPaidSale(null);
    setError("");
    setFulfilmentType("COLLECT");
  };

  if (loading) {
    return <div className="one-kiosk one-kiosk-state">Loading OneKiosk…</div>;
  }

  if (confirmation) {
    return (
      <main className="one-kiosk one-kiosk-confirmation">
        <section className="one-kiosk-confirmation-card">
          <div className="one-kiosk-success-icon"><CheckCircle2 size={52} /></div>
          <span className="one-kiosk-eyebrow">Payment complete</span>
          <h1>Thank you</h1>
          <p>Your order has been sent to the counter.</p>
          <div className="one-kiosk-collection-number">
            <span>Your collection number</span>
            <strong>{confirmation.collectionNumber}</strong>
          </div>
          <div className="one-kiosk-confirmation-meta">
            <div><span>Total paid</span><strong>{money(confirmation.total, currency)}</strong></div>
            <div><span>Receipt</span><strong>{confirmation.receiptNumber || "Created"}</strong></div>
          </div>
          <p className="one-kiosk-collection-help">Please keep this number and go to the collection counter. Your number will be called or shown when your order is ready.</p>
          <button type="button" className="one-kiosk-pay" onClick={startNewOrder}>Start a new order</button>
        </section>
      </main>
    );
  }

  return (
    <main className="one-kiosk">
      <header className="one-kiosk-header">
        <div>
          <span className="one-kiosk-eyebrow">Self-service ordering</span>
          <h1>OneKiosk</h1>
          <p>Select what you need, choose how you want to collect it, then pay.</p>
        </div>
        <div className="one-kiosk-basket-badge" aria-label={`${itemCount} items in basket`}>
          <ShoppingBag size={22} />
          <strong>{itemCount}</strong>
        </div>
      </header>

      {error ? (
        <div className="one-kiosk-error">
          {error}
          {paidSale?.id ? <strong> Your payment has already succeeded. Press “Finish order” to retry collection-order creation; you will not be charged again.</strong> : null}
        </div>
      ) : null}

      <div className="one-kiosk-shell">
        <section className="one-kiosk-catalogue">
          <div className="one-kiosk-toolbar">
            <label className="one-kiosk-search">
              <Search size={20} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" />
            </label>
            <div className="one-kiosk-categories" role="tablist" aria-label="Product categories">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={category === item ? "is-active" : ""}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="one-kiosk-grid">
            {visibleProducts.map((product) => (
              <button key={product.id} type="button" className="one-kiosk-product" onClick={() => add(product)}>
                <div className="one-kiosk-product-image">
                  {product.image_url || product.imageUrl
                    ? <img src={product.image_url || product.imageUrl} alt="" />
                    : <span>{String(product.name || "?").slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="one-kiosk-product-copy">
                  <strong>{product.name}</strong>
                  <small>{product.categoryLabel}</small>
                  <span>{money(product.price, currency)}</span>
                </div>
              </button>
            ))}
            {!visibleProducts.length ? <div className="one-kiosk-empty">No products match this selection.</div> : null}
          </div>
        </section>

        <aside className="one-kiosk-cart">
          <div className="one-kiosk-cart-title">
            <div>
              <span>Your order</span>
              <strong>{itemCount} {itemCount === 1 ? "item" : "items"}</strong>
            </div>
            {basket.length && !paidSale ? (
              <button type="button" className="one-kiosk-clear" onClick={() => setBasket([])} aria-label="Clear basket">
                <Trash2 size={18} />
              </button>
            ) : null}
          </div>

          <div className="one-kiosk-lines">
            {basket.map((line) => (
              <div className="one-kiosk-line" key={line.id}>
                <div>
                  <strong>{line.name}</strong>
                  <span>{money(Number(line.price || 0) * line.quantity, currency)}</span>
                </div>
                <div className="one-kiosk-quantity">
                  <button type="button" disabled={Boolean(paidSale)} onClick={() => changeQuantity(line.id, -1)}><Minus size={17} /></button>
                  <strong>{line.quantity}</strong>
                  <button type="button" disabled={Boolean(paidSale)} onClick={() => changeQuantity(line.id, 1)}><Plus size={17} /></button>
                </div>
              </div>
            ))}
            {!basket.length ? (
              <div className="one-kiosk-cart-empty">
                <ShoppingBag size={34} />
                <strong>Your order is empty</strong>
                <span>Tap a product to add it.</span>
              </div>
            ) : null}
          </div>

          <div className="one-kiosk-fulfilment">
            <span>How would you like it?</span>
            <div>
              {[
                ["COLLECT", "Collect"],
                ["TAKEAWAY", "Takeaway"],
                ["EAT_IN", "Eat in"],
                ["COUNTER_SERVICE", "Counter"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  disabled={Boolean(paidSale)}
                  className={fulfilmentType === value ? "is-active" : ""}
                  onClick={() => setFulfilmentType(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="one-kiosk-total">
            <span>Total</span>
            <strong>{money(total, currency)}</strong>
          </div>

          <button
            type="button"
            className="one-kiosk-pay"
            disabled={!basket.length || paying}
            onClick={payAndCollect}
          >
            <CreditCard size={20} />
            {paying ? "Processing…" : paidSale ? "Finish order" : "Pay & collect"}
          </button>
          <small className="one-kiosk-payment-note">Card payment is processed through the payment terminal configured for this store/kiosk.</small>
        </aside>
      </div>
    </main>
  );
}
