import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { apiRequest, KIOSK_TOKEN_STORAGE_KEY } from "../../services/api.js";
import "./oneKiosk.css";

const ONE_KIOSK_DEVICE_KEY = "onepos_one_kiosk_device_key";

function kioskDeviceKey() {
  try {
    const existing = localStorage.getItem(ONE_KIOSK_DEVICE_KEY);
    if (existing) return existing;
    const next = typeof crypto?.randomUUID === "function"
      ? `kiosk-${crypto.randomUUID()}`
      : `kiosk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ONE_KIOSK_DEVICE_KEY, next);
    return next;
  } catch {
    return `kiosk-session-${Date.now()}`;
  }
}

const DEMO_PRODUCTS = [
  {
    id: "demo-classic-beef",
    name: "Classic Beef Burger",
    sku: "DEMO-BEEF-01",
    description: "Juicy beef patty, cheese, lettuce and tomato",
    categoryLabel: "Burgers",
    price: 5.49,
    imageUrl: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "demo-crispy-chicken",
    name: "Crispy Chicken Burger",
    sku: "DEMO-CHICK-01",
    description: "Crispy chicken, lettuce and creamy mayo",
    categoryLabel: "Chicken",
    price: 5.29,
    imageUrl: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "demo-veggie-deluxe",
    name: "Veggie Deluxe",
    sku: "DEMO-VEG-01",
    description: "Plant-based patty, lettuce, tomato and onion",
    categoryLabel: "Burgers",
    price: 4.99,
    imageUrl: "https://images.unsplash.com/photo-1520072959219-c595dc870360?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "demo-cheese-fries",
    name: "Cheese Fries",
    sku: "DEMO-SIDE-01",
    description: "Golden fries with melted cheese",
    categoryLabel: "Sides",
    price: 3.49,
    imageUrl: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "demo-chicken-bites",
    name: "Chicken Bites",
    sku: "DEMO-CHICK-02",
    description: "Six crispy chicken pieces with dip",
    categoryLabel: "Chicken",
    price: 3.99,
    imageUrl: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "demo-cola",
    name: "Cola",
    sku: "DEMO-DRINK-01",
    description: "Chilled cola with ice",
    categoryLabel: "Drinks",
    price: 2.29,
    imageUrl: "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "demo-sundae",
    name: "Chocolate Sundae",
    sku: "DEMO-DESSERT-01",
    description: "Soft serve with chocolate sauce",
    categoryLabel: "Desserts",
    price: 2.49,
    imageUrl: "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "demo-shake",
    name: "Vanilla Shake",
    sku: "DEMO-DRINK-02",
    description: "Creamy vanilla shake",
    categoryLabel: "Drinks",
    price: 2.79,
    imageUrl: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=85",
  },
];

function money(value, currency = "GBP") {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function OneKioskPage({ publicMode = false }) {
  const demoMode = useMemo(() => new URLSearchParams(window.location.search).get("demo") === "1", []);
  const [products, setProducts] = useState(demoMode ? DEMO_PRODUCTS : []);
  const [currency, setCurrency] = useState("GBP");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [basket, setBasket] = useState(() => demoMode
    ? [
        { ...DEMO_PRODUCTS.find((product) => product.id === "demo-classic-beef"), quantity: 1 },
        { ...DEMO_PRODUCTS.find((product) => product.id === "demo-cheese-fries"), quantity: 1 },
        { ...DEMO_PRODUCTS.find((product) => product.id === "demo-cola"), quantity: 1 },
      ]
    : []
  );
  const [fulfilmentType, setFulfilmentType] = useState("COLLECT");
  const [paying, setPaying] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [paidSale, setPaidSale] = useState(null);
  const [deviceState, setDeviceState] = useState(null);
  const [experienceUi, setExperienceUi] = useState(null);
  const [experienceFlow, setExperienceFlow] = useState(null);
  const [paymentRuntime, setPaymentRuntime] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productOptions, setProductOptions] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState({});
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());

  useEffect(() => {
    if (demoMode) {
      setProducts(DEMO_PRODUCTS);
      setCurrency("GBP");
      apiRequest("/api/kiosk/flows")
        .then((response) => {
          const flows = Array.isArray(response?.data) ? response.data : [];
          const selected = flows.find((flow) => flow?.action?.defaultForNewDevices === true) || flows[0];
          if (selected?.action?.ui) {
            setExperienceUi(selected.action.ui);
            setExperienceFlow({ id: selected.id, name: selected.name, version: selected.version, templateKey: selected.action?.templateKey || null });
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
      return undefined;
    }
    let live = true;
    Promise.all([
      apiRequest("/api/kiosk/catalogue"),
      apiRequest("/api/settings").catch(() => null),
    ])
      .then(([productResponse, settingsResponse]) => {
        if (!live) return;
        if (!productResponse?.success) throw new Error(productResponse?.message || "Unable to load kiosk catalogue");
        const rows = (Array.isArray(productResponse.data) ? productResponse.data : [])
          .filter((product) => product?.active !== false)
          .map((product) => ({
            ...product,
            categoryLabel: product.categoryLabel || product.category_name || product.category || "Other",
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
  }, [demoMode, publicMode]);

  const loadExperience = async (deviceKey) => {
    const response = await apiRequest(`/api/kiosk/runtime?deviceKey=${encodeURIComponent(deviceKey)}`, {
      timeoutMs: 8000,
      retryGet: true,
    });
    if (!response?.success || !response?.data?.ui) {
      throw new Error(response?.message || "No OneKiosk experience flow is assigned");
    }
    setExperienceUi(response.data.ui);
    setExperienceFlow(response.data.flow || null);
    setPaymentRuntime(response.data.payment || null);
    return response.data;
  };

  useEffect(() => {
    if (demoMode) return undefined;
    let live = true;
    let timer = null;
    const key = kioskDeviceKey();

    const sendHeartbeat = async (device) => {
      if (!device?.id || !live) return;
      const internetStatus = navigator.onLine ? "ONLINE" : "OFFLINE";
      let serverStatus = "OFFLINE";
      let paymentStatus = "UNKNOWN";
      let printerStatus = "UNKNOWN";
      let serverMessage = "";
      let paymentMessage = "";
      let printerMessage = "";

      try {
        const health = await apiRequest("/api/health", { timeoutMs: 6000, retryGet: false });
        serverStatus = health?.success === false ? "DEGRADED" : "ONLINE";
        serverMessage = health?.message || "";
      } catch (reason) {
        serverStatus = "OFFLINE";
        serverMessage = reason?.message || "Server unavailable";
      }

      try {
        const runtime = await apiRequest(`/api/kiosk/runtime?deviceKey=${encodeURIComponent(key)}`, { timeoutMs: 6000, retryGet: false });
        const payment = runtime?.data?.payment || null;
        paymentStatus = payment?.status || "NOT_CONFIGURED";
        paymentMessage = payment?.error || "";
        if (live && payment) setPaymentRuntime(payment);
      } catch (reason) {
        paymentStatus = serverStatus === "OFFLINE" ? "UNKNOWN" : "ERROR";
        paymentMessage = reason?.message || "Payment status unavailable";
      }

      try {
        const printer = await apiRequest("/api/connector-capabilities/printer.status", { timeoutMs: 6000, retryGet: false });
        printerStatus = printer?.data?.available === true ? "READY" : "NOT_CONFIGURED";
        printerMessage = printer?.message || printer?.data?.message || "";
      } catch (reason) {
        printerStatus = serverStatus === "OFFLINE" ? "UNKNOWN" : "ERROR";
        printerMessage = reason?.message || "Printer status unavailable";
      }

      try {
        const heartbeat = await apiRequest(`/api/kiosk/devices/${device.id}/heartbeat`, {
          method: "POST",
          body: JSON.stringify({
            internetStatus,
            serverStatus,
            paymentStatus,
            printerStatus,
            details: {
              userAgent: navigator.userAgent,
              online: navigator.onLine,
              serverMessage,
              paymentMessage,
              printerMessage,
              screen: { width: window.screen?.width || null, height: window.screen?.height || null },
            },
          }),
        });
        if (live && heartbeat?.data) setDeviceState(heartbeat.data);
      } catch {}
    };

    const register = async () => {
      try {
        let device = null;
        const hasKioskToken = publicMode && Boolean(localStorage.getItem(KIOSK_TOKEN_STORAGE_KEY));

        if (hasKioskToken) {
          const runtime = await loadExperience(key);
          device = runtime?.device || null;
        } else {
          const response = await apiRequest("/api/kiosk/devices/register", {
            method: "POST",
            body: JSON.stringify({
              deviceKey: key,
              name: `OneKiosk ${key.slice(-6).toUpperCase()}`,
            }),
          });
          if (!response?.success || !response?.data) return;
          device = response.data;

          if (publicMode) {
            const session = await apiRequest("/api/kiosk/device-session", {
              method: "POST",
              body: JSON.stringify({ deviceKey: key }),
            });
            if (!session?.success || !session?.data?.modeToken) {
              throw new Error(session?.message || "Unable to secure this kiosk device");
            }
            localStorage.setItem(KIOSK_TOKEN_STORAGE_KEY, session.data.modeToken);
          }

          await loadExperience(key);
        }

        if (live && device) setDeviceState(device);
        if (device?.id) {
          await sendHeartbeat(device);
          timer = window.setInterval(() => void sendHeartbeat(device), 20000);
        }
      } catch (reason) {
        if (live) setError(reason?.message || "Unable to start OneKiosk");
      }
    };

    void register();
    const onlineListener = () => {
      if (deviceState?.id) void sendHeartbeat(deviceState);
    };
    window.addEventListener("online", onlineListener);
    window.addEventListener("offline", onlineListener);
    return () => {
      live = false;
      if (timer) window.clearInterval(timer);
      window.removeEventListener("online", onlineListener);
      window.removeEventListener("offline", onlineListener);
    };
  }, [demoMode]);

  const screensByType = useMemo(() => {
    const map = {};
    for (const screen of Array.isArray(experienceUi?.screens) ? experienceUi.screens : []) {
      if (screen?.type) map[screen.type] = screen;
    }
    return map;
  }, [experienceUi]);

  const catalogueScreen = screensByType.CATALOGUE || {};
  const productScreen = screensByType.PRODUCT_DETAIL || {};
  const fulfilmentScreen = screensByType.FULFILMENT || {};
  const paymentScreen = screensByType.PAYMENT || {};
  const recommendationsScreen = screensByType.RECOMMENDATIONS || {};
  const basketScreen = screensByType.BASKET || {};
  const confirmationScreen = screensByType.CONFIRMATION || {};
  const fulfilmentOptions = Array.isArray(fulfilmentScreen.options) ? fulfilmentScreen.options : [];
  const featureFlags = experienceUi?.features || {};

  useEffect(() => {
    if (!fulfilmentOptions.length) return;
    const requestedDefault = fulfilmentScreen.defaultOption;
    const next = fulfilmentOptions.some((option) => option.key === requestedDefault)
      ? requestedDefault
      : fulfilmentOptions[0]?.key;
    if (next) setFulfilmentType(next);
  }, [experienceFlow?.id, fulfilmentScreen.defaultOption, fulfilmentOptions.map((option) => option.key).join("|")]);

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

  useEffect(() => {
    if (demoMode || !basket.length) {
      setQuote(null);
      setQuoteLoading(false);
      return undefined;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      apiRequest("/api/kiosk/quote", {
        method: "POST",
        body: JSON.stringify({
          items: basket.map((line) => ({
            productId: line.id,
            quantity: Number(line.quantity) || 1,
            modifiers: Array.isArray(line.modifiers) ? line.modifiers : [],
          })),
        }),
      })
        .then((response) => {
          if (!live) return;
          if (!response?.success) throw new Error(response?.message || "Unable to price order");
          setQuote(response.data || null);
          setError("");
        })
        .catch((reason) => {
          if (live) setError(reason?.message || "Unable to confirm current prices");
        })
        .finally(() => {
          if (live) setQuoteLoading(false);
        });
    }, 180);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [basket, demoMode]);

  const visualTotal = basket.reduce((sum, line) => sum + Number(line.price || 0) * Number(line.quantity || 0), 0);
  const total = quote?.total ?? visualTotal;
  const itemCount = basket.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

  const modifierSelections = useMemo(
    () => Object.values(selectedModifiers).flat().filter(Boolean),
    [selectedModifiers]
  );

  const selectedVariant = useMemo(() => {
    const variants = Array.isArray(productOptions?.variants) ? productOptions.variants : [];
    return variants.find((variant) => String(variant.id) === String(selectedVariantId)) || selectedProduct;
  }, [productOptions, selectedVariantId, selectedProduct]);

  const requiredModifiersSatisfied = useMemo(() => {
    const groups = Array.isArray(productOptions?.modifierGroups) ? productOptions.modifierGroups : [];
    return groups.every((group) => !group.required || (selectedModifiers[group.id] || []).length > 0);
  }, [productOptions, selectedModifiers]);

  const configuredProductPrice = useMemo(() => {
    const base = Number(selectedVariant?.price ?? selectedProduct?.price ?? 0);
    const extras = modifierSelections.reduce((sum, option) => sum + Number(option.price || 0), 0);
    return base + extras;
  }, [selectedVariant, selectedProduct, modifierSelections]);

  const addToBasket = (product, { variant = null, modifiers = [] } = {}) => {
    const target = variant || product;
    const selected = modifiers.map((option) => ({
      optionId: option.id,
      name: option.name,
      price: Number(option.price || 0),
      quantity: 1,
    }));
    const modifierKey = selected.map((item) => String(item.optionId)).sort().join(",");
    const lineKey = `${target.id}::${modifierKey}`;
    const displayPrice = Number(target.price || 0) + selected.reduce((sum, item) => sum + item.price, 0);
    setBasket((current) => {
      const existing = current.find((line) => line.lineKey === lineKey);
      if (existing) {
        return current.map((line) => line.lineKey === lineKey ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, {
        ...target,
        id: target.id,
        lineKey,
        name: target.name || product.name,
        price: displayPrice,
        quantity: 1,
        modifiers: selected,
        parentProductId: product.id,
      }];
    });
    setSelectedProduct(null);
    setProductOptions(null);
    setSelectedVariantId("");
    setSelectedModifiers({});
    setLastInteractionAt(Date.now());
  };

  const handleProductAction = async (product) => {
    setLastInteractionAt(Date.now());
    if (catalogueScreen.productAction === "OPEN_DETAIL" && Object.keys(productScreen).length) {
      setSelectedProduct(product);
      setProductOptions(null);
      setSelectedVariantId(String(product.id));
      setSelectedModifiers({});
      if (!demoMode) {
        try {
          const response = await apiRequest(`/api/kiosk/products/${product.id}/options`);
          if (!response?.success) throw new Error(response?.message || "Unable to load product options");
          setProductOptions(response.data || null);
          const variants = Array.isArray(response.data?.variants) ? response.data.variants : [];
          const initial = variants.find((variant) => String(variant.id) === String(product.id))
            || variants.find((variant) => Number(variant.store_stock || 0) > 0)
            || variants[0];
          if (initial?.id) setSelectedVariantId(String(initial.id));
        } catch (reason) {
          setError(reason?.message || "Unable to load product options");
        }
      }
      return;
    }
    addToBasket(product);
  };

  const changeQuantity = (lineKey, delta) => {
    setLastInteractionAt(Date.now());
    setBasket((current) => current
      .map((line) => line.lineKey === lineKey ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line)
      .filter((line) => line.quantity > 0));
  };

  const createFulfilmentFromPaidSale = async (sale) => {
    const fulfilment = await apiRequest("/api/kiosk/orders/from-sale", {
      method: "POST",
      body: JSON.stringify({ saleId: sale.id, fulfilmentType, deviceKey: kioskDeviceKey() }),
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
      if (demoMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 850));
        setConfirmation({
          collectionNumber: `K${Math.floor(100 + Math.random() * 900)}`,
          receiptNumber: `DEMO-${Date.now().toString().slice(-6)}`,
          total,
          fulfilmentType,
        });
        setBasket([]);
        setSearch("");
        setCategory("All");
        return;
      }
      if (paidSale?.id) {
        await createFulfilmentFromPaidSale(paidSale);
        return;
      }

      const runtime = await apiRequest(`/api/kiosk/runtime?deviceKey=${encodeURIComponent(kioskDeviceKey())}`);
      const exactPayment = runtime?.data?.payment || paymentRuntime;
      if (!exactPayment?.connectorInstanceId) {
        throw new Error("No One Connect card machine is assigned to this kiosk");
      }
      if (!["READY","CONNECTED"].includes(String(exactPayment.status || "").toUpperCase())) {
        throw new Error(exactPayment.error || "The assigned card machine is not currently ready");
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
            modifiers: Array.isArray(line.modifiers) ? line.modifiers : [],
          })),
          subtotal: total,
          tax: 0,
          discount: 0,
          total,
          paymentMethod: "card",
          kioskDeviceKey: kioskDeviceKey(),
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
    const next = fulfilmentScreen.defaultOption || fulfilmentOptions[0]?.key || "";
    if (next) setFulfilmentType(next);
  };

  if (loading) {
    return <div className="one-kiosk one-kiosk-state">Loading OneKiosk…</div>;
  }

  if (confirmation) {
    return (
      <main className="one-kiosk one-kiosk-confirmation">
        <section className="one-kiosk-confirmation-card">
          <div className="one-kiosk-success-icon"><CheckCircle2 size={52} /></div>
          <span className="one-kiosk-eyebrow">{confirmationScreen.eyebrow || "Payment complete"}</span>
          <h1>{confirmationScreen.title || "Order confirmed"}</h1>
          <p>{confirmationScreen.subtitle || "Your order has been placed."}</p>
          <div className="one-kiosk-collection-number">
            <span>{confirmationScreen.collectionLabel || "Order reference"}</span>
            <strong>{confirmation.collectionNumber}</strong>
          </div>
          <div className="one-kiosk-confirmation-meta">
            <div><span>Total paid</span><strong>{money(confirmation.total, currency)}</strong></div>
            <div><span>Receipt</span><strong>{confirmation.receiptNumber || "Created"}</strong></div>
          </div>
          <p className="one-kiosk-collection-help">{confirmationScreen.helpText || "Keep this reference for your order."}</p>
          <button type="button" className="one-kiosk-pay" onClick={startNewOrder}>{confirmationScreen.doneLabel || "Start a new order"}</button>
        </section>
      </main>
    );
  }

  return (
    <main className={`one-kiosk${demoMode ? " is-demo" : ""}`}>
      {demoMode ? <div className="one-kiosk-demo-ribbon">Demo catalogue · no live sale or payment is created</div> : null}
      <header className="one-kiosk-header">
        <div>
          <span className="one-kiosk-eyebrow">{experienceFlow?.name || "OneKiosk"}</span>
          <h1>{catalogueScreen.title || "OneKiosk"}</h1>
          <p>{catalogueScreen.subtitle || "Select what you need and continue through the configured journey."}</p>
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
            {catalogueScreen.search !== false ? (
              <label className="one-kiosk-search">
                <Search size={20} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={catalogueScreen.searchPlaceholder || "Search products"} />
              </label>
            ) : null}
            {catalogueScreen.categories !== false ? <div className="one-kiosk-categories" role="tablist" aria-label="Product categories">
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
            </div> : null}
          </div>

          <div className="one-kiosk-grid">
            {visibleProducts.map((product) => (
              <button key={product.id} type="button" className="one-kiosk-product" onClick={() => handleProductAction(product)}>
                <div className="one-kiosk-product-image">
                  {product.image_url || product.imageUrl
                    ? <img src={product.image_url || product.imageUrl} alt="" />
                    : <span>{String(product.name || "?").slice(0, 1).toUpperCase()}</span>}
                </div>
                <div className="one-kiosk-product-copy">
                  <strong>{product.name}</strong>
                  <small>{product.description || product.categoryLabel}</small>
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
              <div className="one-kiosk-line" key={line.lineKey || line.id}>
                <div>
                  <strong>{line.name}</strong>
                  {Array.isArray(line.modifiers) && line.modifiers.length ? <small>{line.modifiers.map((item) => item.name).join(" · ")}</small> : null}
                  <span>{money(Number(line.price || 0) * line.quantity, currency)}</span>
                </div>
                <div className="one-kiosk-quantity">
                  <button type="button" disabled={Boolean(paidSale)} onClick={() => changeQuantity(line.lineKey || line.id, -1)}><Minus size={17} /></button>
                  <strong>{line.quantity}</strong>
                  <button type="button" disabled={Boolean(paidSale)} onClick={() => changeQuantity(line.lineKey || line.id, 1)}><Plus size={17} /></button>
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

          {fulfilmentOptions.length ? (
            <div className="one-kiosk-fulfilment">
              <span>{fulfilmentScreen.title || "Choose fulfilment"}</span>
              <div>
                {fulfilmentOptions.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    disabled={Boolean(paidSale)}
                    className={fulfilmentType === option.key ? "is-active" : ""}
                    onClick={() => setFulfilmentType(option.key)}
                  >
                    {option.label || option.key}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="one-kiosk-total">
            <span>{quoteLoading ? "Checking price…" : "Total"}</span>
            <strong>{money(total, currency)}</strong>
          </div>
          {Number(quote?.savings || 0) > 0 ? <div className="one-kiosk-savings">You save {money(quote.savings, currency)}</div> : null}

          <button
            type="button"
            className="one-kiosk-pay"
            disabled={!basket.length || paying || quoteLoading}
            onClick={payAndCollect}
          >
            <CreditCard size={20} />
            {paying ? "Processing…" : paidSale ? "Finish order" : (paymentScreen.actionLabel || "Continue")}
          </button>
          <small className="one-kiosk-payment-note">{demoMode ? "Demo payment completes on-screen without charging a card." : "Card payment is processed through the payment terminal configured for this store/kiosk."}</small>
        </aside>
      </div>

      {selectedProduct ? (
        <div className="one-kiosk-product-modal" role="dialog" aria-modal="true" aria-label={selectedProduct.name}>
          <div className="one-kiosk-product-modal-card">
            <button type="button" className="one-kiosk-modal-close" onClick={() => setSelectedProduct(null)}>×</button>
            <div className="one-kiosk-product-modal-image">
              {selectedProduct.image_url || selectedProduct.imageUrl
                ? <img src={selectedProduct.image_url || selectedProduct.imageUrl} alt="" />
                : <span>{String(selectedProduct.name || "?").slice(0, 1).toUpperCase()}</span>}
            </div>
            <div className="one-kiosk-product-modal-copy">
              <span className="one-kiosk-eyebrow">{selectedProduct.categoryLabel || "Product"}</span>
              <h2>{selectedProduct.name}</h2>
              {productScreen.description !== false && selectedProduct.description ? <p>{selectedProduct.description}</p> : null}
              {productScreen.variants && Array.isArray(productOptions?.variants) && productOptions.variants.length > 1 ? (
                <div className="one-kiosk-option-group">
                  <strong>Choose option</strong>
                  <div className="one-kiosk-choice-grid">
                    {productOptions.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        className={String(selectedVariantId) === String(variant.id) ? "is-active" : ""}
                        disabled={variant.track_stock === true && Number(variant.store_stock || 0) <= 0}
                        onClick={() => setSelectedVariantId(String(variant.id))}
                      >
                        <span>{Object.values(variant.variant_attributes || {}).join(" · ") || variant.name}</span>
                        <small>{variant.track_stock === true && Number(variant.store_stock || 0) <= 0 ? "Out of stock" : money(variant.price, currency)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {productScreen.specifications && productOptions?.metadata?.specifications ? (
                <div className="one-kiosk-specs">
                  {Object.entries(productOptions.metadata.specifications).map(([key, value]) => <div key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}
                </div>
              ) : null}
              {productScreen.nutrition && productOptions?.metadata?.nutrition ? (
                <div className="one-kiosk-specs">
                  {Object.entries(productOptions.metadata.nutrition).map(([key, value]) => <div key={key}><span>{key}</span><strong>{String(value)}</strong></div>)}
                </div>
              ) : null}
              {productScreen.allergens && Array.isArray(productOptions?.metadata?.allergens) && productOptions.metadata.allergens.length ? (
                <div className="one-kiosk-allergens"><strong>Allergens</strong><span>{productOptions.metadata.allergens.join(" · ")}</span></div>
              ) : null}
              {productScreen.stockPromise ? (
                <div className="one-kiosk-stock-promise">
                  {selectedVariant?.track_stock === true
                    ? Number(selectedVariant?.store_stock || selectedProduct.store_stock || 0) > 0
                      ? `Available here · ${Number(selectedVariant?.store_stock || selectedProduct.store_stock || 0)} in stock`
                      : "Not currently available at this store"
                    : "Available"}
                </div>
              ) : null}
              {productScreen.modifiers && Array.isArray(productOptions?.modifierGroups) ? productOptions.modifierGroups.map((group) => (
                <div className="one-kiosk-option-group" key={group.id}>
                  <div className="one-kiosk-option-title">
                    <strong>{group.name}</strong>
                    <small>{group.required ? "Required" : "Optional"} · choose up to {group.maxSelections}</small>
                  </div>
                  <div className="one-kiosk-choice-grid">
                    {group.options.map((option) => {
                      const selected = (selectedModifiers[group.id] || []).some((item) => item.id === option.id);
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={selected ? "is-active" : ""}
                          onClick={() => setSelectedModifiers((current) => {
                            const existing = current[group.id] || [];
                            if (selected) return { ...current, [group.id]: existing.filter((item) => item.id !== option.id) };
                            const next = group.maxSelections <= 1 ? [option] : [...existing, option].slice(-group.maxSelections);
                            return { ...current, [group.id]: next };
                          })}
                        >
                          <span>{option.name}</span>
                          <small>{Number(option.price || 0) > 0 ? `+${money(option.price, currency)}` : "Included"}</small>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )) : null}
              {productOptions?.metadata?.warranty && productScreen.warranty ? <div className="one-kiosk-warranty">{productOptions.metadata.warranty}</div> : null}
              <div className="one-kiosk-product-modal-footer">
                <strong>{money(configuredProductPrice, currency)}</strong>
                <button
                  type="button"
                  className="one-kiosk-pay"
                  disabled={!requiredModifiersSatisfied || (selectedVariant?.track_stock === true && Number(selectedVariant?.store_stock || 0) <= 0)}
                  onClick={() => addToBasket(selectedProduct, { variant: selectedVariant, modifiers: modifierSelections })}
                >
                  {!requiredModifiersSatisfied ? "Choose required options" : (productScreen.addLabel || "Add to order")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
