import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
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

  if (loading) {
    return <div className="one-kiosk one-kiosk-state">Loading OneKiosk…</div>;
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

      {error ? <div className="one-kiosk-error">{error}</div> : null}

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
            {basket.length ? (
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
                  <button type="button" onClick={() => changeQuantity(line.id, -1)}><Minus size={17} /></button>
                  <strong>{line.quantity}</strong>
                  <button type="button" onClick={() => changeQuantity(line.id, 1)}><Plus size={17} /></button>
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
            disabled={!basket.length}
            onClick={() => setError("OneKiosk catalogue and basket are ready. Payment + collection-order creation is the next wired step.")}
          >
            Continue to payment
          </button>
        </aside>
      </div>
    </main>
  );
}
