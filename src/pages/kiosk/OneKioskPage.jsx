import { Fragment, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Minus, Plus, Search, ShoppingBag, Trash2, ArrowLeft, Accessibility, Languages, HelpCircle, QrCode, GitCompareArrows, Volume2, LogOut } from "lucide-react";
import { apiRequest, KIOSK_TOKEN_STORAGE_KEY, lockToKioskMode } from "../../services/api.js";
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
  const demoFlowKey = useMemo(() => new URLSearchParams(window.location.search).get("flow") || "", []);
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
  const [printerRuntime, setPrinterRuntime] = useState(null);
  const [runtimeUnavailable, setRuntimeUnavailable] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productOptions, setProductOptions] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState({});
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [lastInteractionAt, setLastInteractionAt] = useState(() => Date.now());
  const [storeAvailability, setStoreAvailability] = useState([]);
  const [currentScreenKey, setCurrentScreenKey] = useState("");
  const [lastAddedProductId, setLastAddedProductId] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const [accessMode, setAccessMode] = useState("DEFAULT");
  const [language, setLanguage] = useState("en");
  const [attractMode, setAttractMode] = useState(publicMode);
  const [idleWarning, setIdleWarning] = useState(false);
  const [receiptQr, setReceiptQr] = useState(null);
  const [customerLookup, setCustomerLookup] = useState("");
  const [customer, setCustomer] = useState(null);
  const [customerLookupBusy, setCustomerLookupBusy] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [receiptEmailBusy, setReceiptEmailBusy] = useState(false);
  const [receiptEmailSent, setReceiptEmailSent] = useState(false);
  const [checkoutRequestId, setCheckoutRequestId] = useState("");
  const [journeyData, setJourneyData] = useState({});
  const [pendingAgeProduct, setPendingAgeProduct] = useState(null);
  const [ageApprovalBusy, setAgeApprovalBusy] = useState(false);
  const [fulfilmentDetails, setFulfilmentDetails] = useState({
    storeId: "",
    name: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    postcode: "",
  });

  useEffect(() => {
    if (demoMode) {
      setProducts(DEMO_PRODUCTS);
      setCurrency("GBP");
      apiRequest(demoMode ? "/api/kiosk/flows?demo=1" : "/api/kiosk/flows")
        .then((response) => {
          const flows = Array.isArray(response?.data) ? response.data : [];
          const requested = String(demoFlowKey || "").trim().toLowerCase();
          const selected = (requested
            ? flows.find((flow) => String(flow?.action?.templateKey || "").toLowerCase() === requested)
              || flows.find((flow) => String(flow?.action?.ui?.profile || "").toLowerCase() === requested)
              || flows.find((flow) => String(flow?.name || "").toLowerCase().includes(requested))
            : null)
            || flows.find((flow) => flow?.action?.defaultForNewDevices === true)
            || flows[0];
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
            price: Number(product.display_price ?? product.price ?? 0),
            basePrice: Number(product.base_price ?? product.price ?? 0),
            displaySavings: Number(product.display_savings || 0),
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
  }, [demoMode, demoFlowKey, publicMode]);

  const loadExperience = async (deviceKey) => {
    const response = await apiRequest(`/api/kiosk/runtime?deviceKey=${encodeURIComponent(deviceKey)}`, {
      timeoutMs: 8000,
      retryGet: true,
    });
    if (!response?.success || !response?.data?.ui) {
      const message = response?.message || "This kiosk is temporarily unavailable";
      setRuntimeUnavailable(message);
      throw new Error(message);
    }
    setRuntimeUnavailable("");
    setExperienceUi(response.data.ui);
    setExperienceFlow(response.data.flow || null);
    setPaymentRuntime(response.data.payment || null);
    setPrinterRuntime(response.data.printer || null);
    if (response.data.device) {
      setDeviceState((current) => ({ ...(current || {}), ...response.data.device }));
    }
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
        const runtime = await apiRequest(`/api/kiosk/runtime?deviceKey=${encodeURIComponent(key)}`, { timeoutMs: 6000, retryGet: false });
        const printer = runtime?.data?.printer || printerRuntime || null;
        printerStatus = printer?.status || (printer?.name ? "UNKNOWN" : "NOT_CONFIGURED");
        printerMessage = printer?.name ? `${printer.name}${printer.address ? ` · ${printer.address}` : ""}` : "";
        if (live && printer) setPrinterRuntime(printer);
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
            lockToKioskMode();
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

  const screenSequence = useMemo(
    () => Array.isArray(experienceUi?.screens) ? experienceUi.screens.filter((screen) => screen?.key && screen?.type) : [],
    [experienceUi]
  );

  const screensByType = useMemo(() => {
    const map = {};
    for (const screen of screenSequence) {
      if (screen?.type) map[screen.type] = screen;
    }
    return map;
  }, [screenSequence]);

  const screensByKey = useMemo(
    () => Object.fromEntries(screenSequence.map((screen) => [screen.key, screen])),
    [screenSequence]
  );

  const currentScreen = screensByKey[currentScreenKey] || screenSequence[0] || null;

  useEffect(() => {
    if (!screenSequence.length) return;
    const requested = experienceUi?.startScreen;
    const first = requested && screensByKey[requested] ? requested : screenSequence[0].key;
    setCurrentScreenKey((current) => current && screensByKey[current] ? current : first);
  }, [experienceFlow?.id, screenSequence.map((screen) => screen.key).join("|")]);

  const goToScreen = (keyOrType) => {
    const direct = screensByKey[keyOrType];
    const byType = screenSequence.find((screen) => screen.type === keyOrType);
    const target = direct || byType;
    if (target?.key) {
      setCurrentScreenKey(target.key);
      setLastInteractionAt(Date.now());
      setError("");
    }
  };

  const workflowValue = (path) => {
    const context = {
      fulfilmentType,
      basketCount: basket.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
      customerId: customer?.id || null,
      customerIdentified: Boolean(customer?.id),
      journeyData,
      ...journeyData,
    };
    return String(path || "").split(".").filter(Boolean).reduce((value, key) => value?.[key], context);
  };

  const matchesJourneyCondition = (condition) => {
    if (!condition || typeof condition !== "object" || !condition.path) return true;
    const actual = workflowValue(condition.path);
    const operator = String(condition.operator || "equals").toLowerCase();
    const expected = condition.value;
    if (operator === "equals") return String(actual ?? "") === String(expected ?? "");
    if (operator === "not_equals") return String(actual ?? "") !== String(expected ?? "");
    if (operator === "in") {
      const values = Array.isArray(expected) ? expected : String(expected ?? "").split(",").map((item) => item.trim());
      return values.map(String).includes(String(actual ?? ""));
    }
    if (operator === "not_in") {
      const values = Array.isArray(expected) ? expected : String(expected ?? "").split(",").map((item) => item.trim());
      return !values.map(String).includes(String(actual ?? ""));
    }
    if (operator === "truthy") return Boolean(actual);
    if (operator === "falsy") return !actual;
    if (operator === "greater_than") return Number(actual) > Number(expected);
    if (operator === "less_than") return Number(actual) < Number(expected);
    return true;
  };

  const screenApplicable = (screen) => {
    if (!screen) return false;
    if (screen.showWhen && !matchesJourneyCondition(screen.showWhen)) return false;
    if (Array.isArray(screen.showWhenAll) && !screen.showWhenAll.every(matchesJourneyCondition)) return false;
    return true;
  };

  const resolveApplicableScreen = (candidate, visited = new Set()) => {
    if (!candidate || visited.has(candidate.key)) return null;
    if (screenApplicable(candidate)) return candidate;
    visited.add(candidate.key);
    if (candidate.next && screensByKey[candidate.next]) return resolveApplicableScreen(screensByKey[candidate.next], visited);
    const index = screenSequence.findIndex((screen) => screen.key === candidate.key);
    return resolveApplicableScreen(index >= 0 ? screenSequence[index + 1] : null, visited);
  };

  const nextScreenFrom = (screen, fallbackType = null) => {
    for (const rule of Array.isArray(screen?.nextRules) ? screen.nextRules : []) {
      if (matchesJourneyCondition(rule?.when) && rule?.next && screensByKey[rule.next]) {
        const resolved = resolveApplicableScreen(screensByKey[rule.next]);
        if (resolved) return resolved;
      }
    }
    if (screen?.next && screensByKey[screen.next]) {
      const resolved = resolveApplicableScreen(screensByKey[screen.next]);
      if (resolved) return resolved;
    }
    const index = screenSequence.findIndex((candidate) => candidate.key === screen?.key);
    if (index >= 0) {
      const resolved = resolveApplicableScreen(screenSequence[index + 1]);
      if (resolved) return resolved;
    }
    const fallback = fallbackType ? screenSequence.find((candidate) => candidate.type === fallbackType) || null : null;
    return resolveApplicableScreen(fallback);
  };

  const catalogueScreen = screensByType.CATALOGUE || {};
  const productScreen = screensByType.PRODUCT_DETAIL || {};
  const fulfilmentScreen = screensByType.FULFILMENT || {};
  const paymentScreen = screensByType.PAYMENT || {};
  const recommendationsScreen = screensByType.RECOMMENDATIONS || {};
  const basketScreen = screensByType.BASKET || {};
  const loyaltyScreen = screensByType.LOYALTY || {};
  const confirmationScreen = screensByType.CONFIRMATION || {};
  const fulfilmentOptions = Array.isArray(fulfilmentScreen.options) ? fulfilmentScreen.options : [];
  const selectedFulfilmentOption = fulfilmentOptions.find((option) => option.key === fulfilmentType) || null;
  const fulfilmentRequirements = Array.isArray(selectedFulfilmentOption?.requires) ? selectedFulfilmentOption.requires : [];
  const featureFlags = experienceUi?.features || {};
  const availableLanguages = Array.isArray(experienceUi?.languages) && experienceUi.languages.length
    ? experienceUi.languages
    : [{ key: "en", label: "English" }];

  const translate = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[language] || value.en || Object.values(value)[0] || "";
    }
    return value || "";
  };

  const translateKey = (key, fallback = "") => {
    if (language === "en") return translate(fallback);
    const dictionary = experienceUi?.translations?.[language] || {};
    return dictionary[key] || translate(fallback);
  };

  const needsStoreAvailability = fulfilmentRequirements.includes("STORE") || fulfilmentType === "DELIVERY";

  useEffect(() => {
    if (!needsStoreAvailability || !basket.length || demoMode) {
      if (!needsStoreAvailability) setStoreAvailability([]);
      return undefined;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      apiRequest("/api/kiosk/availability", {
        method: "POST",
        body: JSON.stringify({
          items: basket.map((line) => ({ productId: line.id, quantity: Number(line.quantity) || 1 })),
        }),
      })
        .then((response) => {
          if (!live || !response?.success) return;
          const rows = Array.isArray(response.data) ? response.data : [];
          setStoreAvailability(rows);
          if (fulfilmentType === "DELIVERY") {
            const current = rows.find((store) => store.current && store.canFulfil);
            const available = current || rows.find((store) => store.canFulfil);
            if (available) setFulfilmentDetails((details) => ({ ...details, storeId: available.id }));
          }
        })
        .catch(() => { if (live) setStoreAvailability([]); });
    }, 180);
    return () => { live = false; window.clearTimeout(timer); };
  }, [needsStoreAvailability, fulfilmentType, basket, demoMode]);

  useEffect(() => {
    if (!fulfilmentOptions.length) return;
    const requestedDefault = fulfilmentScreen.defaultOption;
    const next = fulfilmentOptions.some((option) => option.key === requestedDefault)
      ? requestedDefault
      : fulfilmentOptions[0]?.key;
    if (next) setFulfilmentType(next);
  }, [experienceFlow?.id, fulfilmentScreen.defaultOption, fulfilmentOptions.map((option) => option.key).join("|")]);

  useEffect(() => {
    if (!selectedFulfilmentOption) return;
    setLastInteractionAt(Date.now());
    if (!fulfilmentRequirements.includes("STORE") && fulfilmentType !== "DELIVERY") {
      setFulfilmentDetails((details) => ({ ...details, storeId: "" }));
    }
  }, [fulfilmentType]);

  useEffect(() => {
    if (!publicMode || !featureFlags.idleReset) return undefined;
    const timeoutSeconds = Math.max(30, Number(experienceUi?.idleTimeoutSeconds || 75));
    const warningSeconds = Math.min(20, Math.max(8, Number(experienceUi?.idleWarningSeconds || 15)));
    const tick = window.setInterval(() => {
      const idleSeconds = (Date.now() - lastInteractionAt) / 1000;
      setIdleWarning(idleSeconds >= timeoutSeconds - warningSeconds && idleSeconds < timeoutSeconds);
      if (idleSeconds >= timeoutSeconds) {
        setBasket([]);
        setSelectedProduct(null);
        setProductOptions(null);
        setSelectedModifiers({});
        setSelectedVariantId("");
        setCompareIds([]);
        setSearch("");
        setCategory("All");
        setFulfilmentDetails({ storeId: "", name: "", email: "", phone: "", address1: "", address2: "", city: "", postcode: "" });
        setStoreAvailability([]);
        setPaidSale(null);
        setConfirmation(null);
        setReceiptQr(null);
        setCustomer(null);
        setCustomerLookup("");
        setRedeemPoints(0);
        setReceiptEmail("");
        setReceiptEmailSent(false);
        setCheckoutRequestId("");
        setJourneyData({});
        setPendingAgeProduct(null);
        setError("");
        setIdleWarning(false);
        setAttractMode(true);
        const start = experienceUi?.startScreen || screenSequence[0]?.key;
        if (start) setCurrentScreenKey(start);
        setLastInteractionAt(Date.now());
      }
    }, 1000);
    return () => window.clearInterval(tick);
  }, [publicMode, featureFlags.idleReset, lastInteractionAt, experienceUi?.idleTimeoutSeconds, experienceFlow?.id]);

  useEffect(() => {
    const touch = () => {
      setLastInteractionAt(Date.now());
      setIdleWarning(false);
    };
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("keydown", touch);
    return () => {
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("keydown", touch);
    };
  }, []);

  useEffect(() => {
    if (!confirmation || !confirmationScreen.resetAfterSeconds) return undefined;
    const timer = window.setTimeout(() => startNewOrder(), Math.max(5, Number(confirmationScreen.resetAfterSeconds)) * 1000);
    return () => window.clearTimeout(timer);
  }, [confirmation?.collectionNumber]);

  const categories = useMemo(
    () => ["All", ...new Set(products.map((product) => product.categoryLabel).filter(Boolean))],
    [products]
  );

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (product.age_restricted === true && featureFlags.ageVerification !== true) return false;
      if (category !== "All" && product.categoryLabel !== category) return false;
      if (!query) return true;
      return [product.name, product.sku, product.barcode, product.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [products, category, search, featureFlags.ageVerification]);

  const recommendationProducts = useMemo(() => {
    if (!lastAddedProductId) return [];
    const sourceProduct = products.find((product) => String(product.id) === String(lastAddedProductId));
    const metadata = sourceProduct?.kiosk_metadata || sourceProduct?.kioskMetadata || {};
    const sourceKey = String(recommendationsScreen.source || "CROSS_SELL").toUpperCase();
    const candidateIds = metadata?.recommendations?.[sourceKey]
      || metadata?.recommendations?.[sourceKey.toLowerCase()]
      || metadata?.[`${sourceKey.toLowerCase()}ProductIds`]
      || [];
    const ids = new Set((Array.isArray(candidateIds) ? candidateIds : []).map(String));
    return products.filter((product) => ids.has(String(product.id)));
  }, [lastAddedProductId, products, recommendationsScreen.source]);

  const comparedProducts = useMemo(
    () => compareIds.map((id) => products.find((product) => String(product.id) === String(id))).filter(Boolean),
    [compareIds, products]
  );

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

  const loyaltyRedeemValue = useMemo(() => {
    const valuePerPoint = Number(customer?.loyalty_redeem_value_per_point || 0);
    const points = Number(redeemPoints || 0);
    if (!customer?.loyalty_enabled || valuePerPoint <= 0 || points <= 0) return 0;
    return Math.min(total, Math.round(points * valuePerPoint * 100) / 100);
  }, [customer, redeemPoints, total]);

  const amountDue = Math.max(0, Math.round((Number(total || 0) - loyaltyRedeemValue) * 100) / 100);

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
    setLastAddedProductId(product.id);
    setSelectedProduct(null);
    setProductOptions(null);
    setSelectedVariantId("");
    setSelectedModifiers({});
    setLastInteractionAt(Date.now());
    const next = nextScreenFrom(productScreen, "RECOMMENDATIONS");
    if (next?.type === "RECOMMENDATIONS") {
      const metadata = product.kiosk_metadata || product.kioskMetadata || productOptions?.metadata || {};
      const sourceKey = String(next.source || "CROSS_SELL").toUpperCase();
      const ids = metadata?.recommendations?.[sourceKey]
        || metadata?.recommendations?.[sourceKey.toLowerCase()]
        || metadata?.[`${sourceKey.toLowerCase()}ProductIds`]
        || [];
      if (Array.isArray(ids) && ids.length) setCurrentScreenKey(next.key);
      else {
        const afterRecommendations = nextScreenFrom(next, "FULFILMENT");
        if (afterRecommendations?.key) setCurrentScreenKey(afterRecommendations.key);
      }
    } else if (next?.key) {
      setCurrentScreenKey(next.key);
    } else {
      goToScreen("CATALOGUE");
    }
  };

  const requestAgeApproval = async (product) => {
    if (ageApprovalBusy) return;
    setAgeApprovalBusy(true);
    setPendingAgeProduct(product);
    setError("");
    try {
      const response = await apiRequest("/api/kiosk/age-approval/request", {
        method: "POST",
        body: JSON.stringify({ deviceKey: kioskDeviceKey() }),
      });
      if (!response?.success) throw new Error(response?.message || "Unable to request staff approval");
    } catch (reason) {
      setPendingAgeProduct(null);
      setError(reason?.message || "Unable to request staff approval");
    } finally {
      setAgeApprovalBusy(false);
    }
  };

  useEffect(() => {
    if (!pendingAgeProduct || demoMode) return undefined;
    let live = true;
    const check = async () => {
      try {
        const runtime = await loadExperience(kioskDeviceKey());
        const approved = runtime?.device?.ageApproved === true;
        if (live && approved) {
          const product = pendingAgeProduct;
          setPendingAgeProduct(null);
          window.setTimeout(() => void handleProductAction(product, { skipAgeCheck: true }), 0);
        }
      } catch {}
    };
    void check();
    const timer = window.setInterval(check, 2000);
    return () => { live = false; window.clearInterval(timer); };
  }, [pendingAgeProduct?.id, demoMode]);

  const handleProductAction = async (product, { skipAgeCheck = false } = {}) => {
    setLastInteractionAt(Date.now());
    if (product?.age_restricted === true && featureFlags.ageVerification === true && !skipAgeCheck) {
      if (deviceState?.ageApproved !== true) {
        await requestAgeApproval(product);
        return;
      }
    }
    if (catalogueScreen.productAction === "OPEN_DETAIL" && Object.keys(productScreen).length) {
      setSelectedProduct(product);
      if (productScreen?.key) setCurrentScreenKey(productScreen.key);
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

  const validateFulfilmentDetails = () => {
    if (fulfilmentRequirements.includes("STORE") && !fulfilmentDetails.storeId) {
      throw new Error("Choose a collection store before continuing");
    }
    if (fulfilmentRequirements.includes("ADDRESS")) {
      if (!fulfilmentDetails.address1.trim() || !fulfilmentDetails.city.trim() || !fulfilmentDetails.postcode.trim()) {
        throw new Error("Enter the delivery address before continuing");
      }
    }
    if (fulfilmentRequirements.includes("CONTACT")) {
      if (!fulfilmentDetails.email.trim() && !fulfilmentDetails.phone.trim()) {
        throw new Error("Enter an email address or phone number for delivery updates");
      }
    }
    if ((fulfilmentRequirements.includes("STORE") || fulfilmentType === "DELIVERY") && fulfilmentDetails.storeId) {
      const selectedStore = storeAvailability.find((store) => String(store.id) === String(fulfilmentDetails.storeId));
      if (selectedStore && selectedStore.canFulfil !== true) {
        throw new Error("The selected store cannot fulfil the current basket");
      }
    }
    return true;
  };

  const createFulfilmentFromPaidSale = async (sale) => {
    const fulfilment = await apiRequest("/api/kiosk/orders/from-sale", {
      method: "POST",
      body: JSON.stringify({
        saleId: sale.id,
        fulfilmentType,
        fulfilmentDetails: { ...fulfilmentDetails, journeyData },
        fulfilmentStoreId: fulfilmentDetails.storeId || null,
        deviceKey: kioskDeviceKey(),
      }),
    });
    if (!fulfilment?.success) {
      throw new Error(fulfilment?.message || "Payment succeeded, but the collection order could not be created");
    }
    setConfirmation({
      ...(fulfilment.data || {}),
      total: sale.total,
    });
    setReceiptEmail(customer?.email || fulfilmentDetails.email || "");
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
      validateFulfilmentDetails();
      if (demoMode) {
        await new Promise((resolve) => window.setTimeout(resolve, 850));
        setConfirmation({
          collectionNumber: `K${Math.floor(100 + Math.random() * 900)}`,
          receiptNumber: `DEMO-${Date.now().toString().slice(-6)}`,
          total,
          fulfilmentType,
          saleId: null,
        });
        setReceiptEmail(customer?.email || fulfilmentDetails.email || "");
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
      if (["NOT_CONFIGURED","DISABLED"].includes(String(exactPayment.status || "").toUpperCase())) {
        throw new Error(exactPayment.error || "The assigned card machine is not available");
      }

      const clientRequestId = checkoutRequestId || crypto.randomUUID();
      if (!checkoutRequestId) setCheckoutRequestId(clientRequestId);
      const saleInput = {
        store_id: fulfilmentDetails.storeId || null,
        customer_id: customer?.id || null,
        subtotal: Number(total || 0),
        tax: 0,
        discount: 0,
        total: Number(total || 0),
        line_count: Number(basket.length),
        status: "COMPLETED",
        offline_created: false,
        sync_status: "SYNCED",
        client_request_id: clientRequestId,
        completed_at: new Date().toISOString(),
      };
      const itemInputs = basket.map((line) => ({
        product_id: line.id,
        product_name: line.name,
        quantity: Number(line.quantity) || 1,
        unit_price: Number(line.price) || 0,
        discount: 0,
        tax: 0,
        total: (Number(line.price) || 0) * (Number(line.quantity) || 1),
        item_type: "PRODUCT",
        modifier_data: Array.isArray(line.modifiers) ? line.modifiers : [],
        bundle_components: [],
      }));
      const paymentInputs = [{
        customer_id: customer?.id || null,
        direction: "IN",
        payment_method: "card",
        amount: Number(total || 0),
        provider: exactPayment.providerKey || exactPayment.provider || null,
        terminal_id: exactPayment.terminalId || exactPayment.terminal_id || null,
        idempotency_key: clientRequestId,
        status: "COMPLETED",
      }];
      const saleResponse = await apiRequest("/api/platform/runtime/objects/sale/buttons/till_complete_sale/execute", {
        method: "POST",
        body: JSON.stringify({
          context: { source: "KIOSK", kioskDeviceKey: kioskDeviceKey() },
          inputs: { sale: saleInput, items: itemInputs, payments: paymentInputs },
        }),
      });
      const saleId = saleResponse?.data?.results?.find?.((step) => step?.stepId === "create_sale")?.result?.created?.id || null;
      if (!saleResponse?.success || !saleId) {
        throw new Error(saleResponse?.message || "Card payment could not be completed");
      }
      const saved = await apiRequest(`/api/platform/objects/sale/records/${encodeURIComponent(saleId)}`);
      const completedSale = saved?.record || saved?.data || { id: saleId, total };
      setPaidSale(completedSale);
      await createFulfilmentFromPaidSale(completedSale);
    } catch (reason) {
      const message = String(reason?.message || "Unable to complete payment");
      const friendly = /declin/i.test(message)
        ? "Card declined. Please try again or use another card."
        : /timeout|timed out/i.test(message)
          ? "The card machine timed out. No second payment will be started until this attempt is resolved."
          : /offline|unavailable|connector/i.test(message)
            ? "The card machine is temporarily unavailable. Please ask a member of staff for help."
            : message;
      setError(friendly);
    } finally {
      setPaying(false);
    }
  };

  const lookupCustomer = async () => {
    const query = customerLookup.trim();
    if (!query || customerLookupBusy) return;
    setCustomerLookupBusy(true);
    setError("");
    try {
      const response = await apiRequest("/api/kiosk/customer-lookup", {
        method: "POST",
        body: JSON.stringify({ query }),
      });
      if (!response?.success || !response?.data) throw new Error(response?.message || "Account not found");
      setCustomer(response.data);
      setRedeemPoints(0);
    } catch (reason) {
      setCustomer(null);
      setError(reason?.message || "Account not found — continue as guest");
    } finally {
      setCustomerLookupBusy(false);
    }
  };

  const speakCurrentScreen = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Spoken guidance is not supported on this device.");
      return;
    }
    window.speechSynthesis.cancel();
    const text = [
      translate(currentScreen?.title),
      translate(currentScreen?.subtitle),
      basket.length ? `Your basket has ${itemCount} ${itemCount === 1 ? "item" : "items"}. Total ${money(total, currency)}.` : "",
      error || "",
    ].filter(Boolean).join(" ");
    const utterance = new SpeechSynthesisUtterance(text || "OneKiosk");
    utterance.lang = language || "en";
    window.speechSynthesis.speak(utterance);
  };

  const exitKioskMode = () => {
    if (!window.confirm("Exit customer kiosk mode and return to staff login?")) return;
    try {
      window.speechSynthesis?.cancel?.();
      localStorage.removeItem(KIOSK_TOKEN_STORAGE_KEY);
      sessionStorage.removeItem("onepos.lastRoute");
    } catch {}
    const base = String(import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    window.location.assign(base || "/");
  };

  const printReceipt = async () => {
    if (demoMode) {
      window.print();
      return;
    }
    const saleId = confirmation?.saleId || confirmation?.order?.platform_data?.saleId || confirmation?.order?.platform_data?.sale_id;
    if (!saleId) {
      window.print();
      return;
    }
    try {
      const response = await apiRequest("/api/kiosk/receipt/print", {
        method: "POST",
        body: JSON.stringify({ saleId, deviceKey: kioskDeviceKey() }),
      });
      if (!response?.success) {
        if (response?.code === "LOCAL_PRINT_FALLBACK") {
          window.print();
          return;
        }
        throw new Error(response?.message || "Receipt printer is unavailable");
      }
    } catch (reason) {
      setError(reason?.message || "Unable to print receipt");
    }
  };

  const sendReceiptEmail = async () => {
    if (!receiptEmail.trim() || receiptEmailBusy) return;
    if (demoMode) {
      setReceiptEmailSent(true);
      return;
    }
    const saleId = confirmation?.saleId || confirmation?.order?.platform_data?.saleId || confirmation?.order?.platform_data?.sale_id;
    if (!saleId) return setError("Email receipt is not available for this order.");
    setReceiptEmailBusy(true);
    setError("");
    try {
      const response = await apiRequest("/api/kiosk/receipt/email", {
        method: "POST",
        body: JSON.stringify({ saleId, email: receiptEmail.trim(), deviceKey: kioskDeviceKey() }),
      });
      if (!response?.success) throw new Error(response?.message || "Unable to send receipt");
      setReceiptEmailSent(true);
    } catch (reason) {
      setError(reason?.message || "Unable to send email receipt");
    } finally {
      setReceiptEmailBusy(false);
    }
  };

  const requestAssistance = async () => {
    try {
      const response = await apiRequest("/api/kiosk/assistance", {
        method: "POST",
        body: JSON.stringify({ deviceKey: kioskDeviceKey(), note: "Customer requested assistance from the kiosk screen" }),
      });
      if (!response?.success) throw new Error(response?.message || "Unable to request assistance");
      setError("Staff have been notified. Please stay near this kiosk.");
    } catch (reason) {
      setError(reason?.message || "Unable to notify staff");
    }
  };

  const generateReceiptQr = async () => {
    const saleId = confirmation?.saleId || confirmation?.order?.platform_data?.saleId || confirmation?.order?.platform_data?.sale_id;
    if (!saleId) return setError("Receipt QR is not available for this order.");
    try {
      const response = await apiRequest(`/api/platform/objects/sale/records/${encodeURIComponent(saleId)}/buttons/till_receipt_qr/execute`, {
        method: "POST",
        body: JSON.stringify({ inputs: { expiryMinutes: Number(confirmationScreen.qrExpiryMinutes || 5), baseUrl: window.location.origin } }),
      });
      if (!response?.success || !response?.data?.qrcodeUrl) throw new Error(response?.message || "Unable to create receipt QR");
      setReceiptQr(response.data);
    } catch (reason) {
      setError(reason?.message || "Unable to create receipt QR");
    }
  };

  const startNewOrder = () => {
    setConfirmation(null);
    setPaidSale(null);
    setError("");
    setFulfilmentDetails({ storeId: "", name: "", email: "", phone: "", address1: "", address2: "", city: "", postcode: "" });
    setStoreAvailability([]);
    const next = fulfilmentScreen.defaultOption || fulfilmentOptions[0]?.key || "";
    if (next) setFulfilmentType(next);
    const start = experienceUi?.startScreen || screenSequence[0]?.key;
    if (start) setCurrentScreenKey(start);
    setLastAddedProductId("");
    setCompareIds([]);
    setReceiptQr(null);
    setCustomer(null);
    setCustomerLookup("");
    setRedeemPoints(0);
    setReceiptEmail("");
    setReceiptEmailSent(false);
    setCheckoutRequestId("");
    setJourneyData({});
    setPendingAgeProduct(null);
    if (publicMode) setAttractMode(true);
  };

  const stageType = currentScreen?.type || "CATALOGUE";
  const receiptMethods = Array.isArray(confirmationScreen.receipt) ? confirmationScreen.receipt : [];
  const rootClasses = [
    "one-kiosk",
    demoMode ? "is-demo" : "",
    accessMode === "LARGE_TEXT" ? "is-large-text" : "",
    accessMode === "REACH" ? "is-reach" : "",
    accessMode === "HIGH_CONTRAST" ? "is-high-contrast" : "",
  ].filter(Boolean).join(" ");

  if (loading) {
    return <div className="one-kiosk one-kiosk-state">Loading OneKiosk…</div>;
  }

  if (runtimeUnavailable && publicMode) {
    return (
      <main className={`${rootClasses} one-kiosk-attract one-kiosk-maintenance`}>
        <section>
          <span className="one-kiosk-eyebrow">OneKiosk</span>
          <h1>Temporarily unavailable</h1>
          <p>{runtimeUnavailable}</p>
          <p>Please use another kiosk or ask a member of staff.</p>
        </section>
      </main>
    );
  }

  if (attractMode && publicMode && !confirmation) {
    return (
      <main className={`${rootClasses} one-kiosk-attract`} onClick={() => { setAttractMode(false); setLastInteractionAt(Date.now()); }}>
        <section>
          <span className="one-kiosk-eyebrow">{experienceFlow?.name || "OneKiosk"}</span>
          <h1>{translate(experienceUi?.attractTitle) || "Touch to start"}</h1>
          <p>{translate(experienceUi?.attractSubtitle) || "Browse, order and pay here."}</p>
          <button type="button" className="one-kiosk-pay">Start order</button>
        </section>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className={`${rootClasses} one-kiosk-confirmation`}>
        <section className="one-kiosk-confirmation-card">
          <div className="one-kiosk-success-icon"><CheckCircle2 size={52} /></div>
          <span className="one-kiosk-eyebrow">{confirmationScreen.eyebrow || "Payment complete"}</span>
          <h1>{translateKey(`screen.${confirmationScreen.key}.title`, confirmationScreen.title) || "Order confirmed"}</h1>
          <p>{translateKey(`screen.${confirmationScreen.key}.subtitle`, confirmationScreen.subtitle) || "Your order has been placed."}</p>
          <div className="one-kiosk-collection-number">
            <span>{translateKey("confirmation.collectionLabel", confirmationScreen.collectionLabel) || "Order reference"}</span>
            <strong>{confirmation.collectionNumber}</strong>
          </div>
          <div className="one-kiosk-confirmation-meta">
            <div><span>Total paid</span><strong>{money(confirmation.total, currency)}</strong></div>
            <div><span>Receipt</span><strong>{confirmation.receiptNumber || "Created"}</strong></div>
          </div>
          <p className="one-kiosk-collection-help">{translateKey("confirmation.helpText", confirmationScreen.helpText) || "Keep this reference for your order."}</p>
          {receiptQr?.qrcodeUrl ? (
            <div className="one-kiosk-receipt-qr">
              <img src={receiptQr.qrcodeUrl} alt="Receipt QR" />
              <small>{receiptQr.expiresAt ? `Available until ${new Date(receiptQr.expiresAt).toLocaleTimeString()}` : "Scan for your receipt"}</small>
            </div>
          ) : null}
          {receiptMethods.includes("EMAIL") ? (
            <div className="one-kiosk-email-receipt">
              <input type="email" value={receiptEmail} disabled={receiptEmailSent} onChange={(e)=>{setReceiptEmail(e.target.value);setReceiptEmailSent(false);}} placeholder="Email receipt to…" />
              <button type="button" disabled={!receiptEmail.trim() || receiptEmailBusy || receiptEmailSent} onClick={sendReceiptEmail}>
                {receiptEmailSent ? "Sent ✓" : receiptEmailBusy ? "Sending…" : "Email receipt"}
              </button>
            </div>
          ) : null}
          <div className="one-kiosk-confirmation-actions">
            {receiptMethods.includes("QR") ? <button type="button" onClick={generateReceiptQr}><QrCode size={18}/> Receipt QR</button> : null}
            {receiptMethods.includes("PRINT") ? <button type="button" onClick={printReceipt}>Print receipt</button> : null}
            <button type="button" className="one-kiosk-pay" onClick={startNewOrder}>{translateKey("confirmation.doneLabel", confirmationScreen.doneLabel) || "Start a new order"}</button>
          </div>
          {idleWarning ? <div className="one-kiosk-idle-warning">This screen will reset shortly.</div> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={rootClasses}>
      {demoMode ? <div className="one-kiosk-demo-ribbon">Demo catalogue · no live sale or payment is created</div> : null}
      <header className="one-kiosk-header">
        <div>
          <span className="one-kiosk-eyebrow">{experienceFlow?.name || "OneKiosk"}</span>
          <h1>{translateKey(`screen.${currentScreen?.key}.title`, currentScreen?.title) || translateKey("screen.catalogue.title", catalogueScreen.title) || "OneKiosk"}</h1>
          <p>{translateKey(`screen.${currentScreen?.key}.subtitle`, currentScreen?.subtitle) || translateKey("screen.catalogue.subtitle", catalogueScreen.subtitle) || "Select what you need and continue through the configured journey."}</p>
        </div>
        <div className="one-kiosk-header-actions">
          {featureFlags.language ? (
            <button type="button" className="one-kiosk-tool" onClick={() => {
              const index = Math.max(0, availableLanguages.findIndex((item) => item.key === language));
              setLanguage(availableLanguages[(index + 1) % availableLanguages.length]?.key || "en");
            }}><Languages size={19}/><span>{availableLanguages.find((item) => item.key === language)?.label || language}</span></button>
          ) : null}
          {featureFlags.audio ? (
            <button type="button" className="one-kiosk-tool" onClick={speakCurrentScreen}><Volume2 size={19}/><span>Read aloud</span></button>
          ) : null}
          {featureFlags.accessibility ? (
            <button type="button" className="one-kiosk-tool" onClick={() => {
              const modes = ["DEFAULT","LARGE_TEXT","REACH","HIGH_CONTRAST"];
              setAccessMode(modes[(modes.indexOf(accessMode) + 1) % modes.length]);
            }}><Accessibility size={19}/><span>{accessMode === "DEFAULT" ? "Accessibility" : accessMode.replaceAll("_"," ")}</span></button>
          ) : null}
          <div className="one-kiosk-basket-badge" aria-label={`${itemCount} items in basket`}>
          <ShoppingBag size={22} />
          <strong>{itemCount}</strong>
          </div>
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
          {stageType === "CATALOGUE" || stageType === "PRODUCT_DETAIL" ? <>
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
                  <span>{product.displaySavings > 0 ? <><s>{money(product.basePrice,currency)}</s> {money(product.price,currency)}</> : money(product.price, currency)}</span>
                </div>
              </button>
            ))}
            {!visibleProducts.length ? <div className="one-kiosk-empty">No products match this selection.</div> : null}
          </div>
          </> : null}

          {stageType === "RECOMMENDATIONS" ? (
            <div className="one-kiosk-stage">
              <div className="one-kiosk-stage-head">
                <button type="button" onClick={() => goToScreen("CATALOGUE")}><ArrowLeft size={18}/> Keep browsing</button>
                <span>{recommendationProducts.length ? `${recommendationProducts.length} suggestions` : "No suggestions needed"}</span>
              </div>
              {recommendationProducts.length ? (
                <div className="one-kiosk-grid">
                  {recommendationProducts.map((product) => (
                    <button key={product.id} type="button" className="one-kiosk-product" onClick={() => handleProductAction(product)}>
                      <div className="one-kiosk-product-image">
                        {product.image_url || product.imageUrl ? <img src={product.image_url || product.imageUrl} alt="" /> : <span>{String(product.name || "?").slice(0,1)}</span>}
                      </div>
                      <div className="one-kiosk-product-copy"><strong>{product.name}</strong><small>{product.description || product.categoryLabel}</small><span>{product.displaySavings > 0 ? <><s>{money(product.basePrice,currency)}</s> {money(product.price,currency)}</> : money(product.price,currency)}</span></div>
                    </button>
                  ))}
                </div>
              ) : <div className="one-kiosk-empty">Your order is ready to continue.</div>}
              <button type="button" className="one-kiosk-pay one-kiosk-stage-next" onClick={() => {
                const next = nextScreenFrom(recommendationsScreen, "FULFILMENT");
                if (next?.key) setCurrentScreenKey(next.key);
              }}>Continue</button>
            </div>
          ) : null}

          {stageType === "FULFILMENT" ? (
            <div className="one-kiosk-stage one-kiosk-stage-narrow">
              <div className="one-kiosk-fulfilment">
                <span>{translateKey(`screen.${fulfilmentScreen.key}.title`, fulfilmentScreen.title) || "Choose fulfilment"}</span>
                <div>{fulfilmentOptions.map((option) => (
                  <button type="button" key={option.key} className={fulfilmentType === option.key ? "is-active" : ""} onClick={() => setFulfilmentType(option.key)}>
                    {translateKey(`fulfilment.${option.key}`, option.label) || option.key}
                  </button>
                ))}</div>
              </div>
              {fulfilmentRequirements.includes("STORE") ? (
                <div className="one-kiosk-fulfilment-detail">
                  <strong>Choose collection store</strong>
                  <div className="one-kiosk-store-list">{storeAvailability.map((store) => (
                    <button type="button" key={store.id} disabled={!store.canFulfil} className={String(fulfilmentDetails.storeId)===String(store.id)?"is-active":""} onClick={() => setFulfilmentDetails((d)=>({...d,storeId:store.id}))}>
                      <span>{store.name}{store.current ? " · This store" : ""}</span><small>{store.canFulfil ? "Available for this order" : "Not enough stock"}</small>
                    </button>
                  ))}</div>
                </div>
              ) : null}
              {fulfilmentRequirements.includes("ADDRESS") ? (
                <div className="one-kiosk-fulfilment-detail">
                  <strong>Delivery details</strong>
                  <div className="one-kiosk-form-grid">
                    <input value={fulfilmentDetails.name} onChange={(e)=>setFulfilmentDetails((d)=>({...d,name:e.target.value}))} placeholder="Name"/>
                    <input value={fulfilmentDetails.phone} onChange={(e)=>setFulfilmentDetails((d)=>({...d,phone:e.target.value}))} placeholder="Mobile number"/>
                    <input className="wide" value={fulfilmentDetails.email} onChange={(e)=>setFulfilmentDetails((d)=>({...d,email:e.target.value}))} placeholder="Email address"/>
                    <input className="wide" value={fulfilmentDetails.address1} onChange={(e)=>setFulfilmentDetails((d)=>({...d,address1:e.target.value}))} placeholder="Address line 1"/>
                    <input className="wide" value={fulfilmentDetails.address2} onChange={(e)=>setFulfilmentDetails((d)=>({...d,address2:e.target.value}))} placeholder="Address line 2 (optional)"/>
                    <input value={fulfilmentDetails.city} onChange={(e)=>setFulfilmentDetails((d)=>({...d,city:e.target.value}))} placeholder="Town / city"/>
                    <input value={fulfilmentDetails.postcode} onChange={(e)=>setFulfilmentDetails((d)=>({...d,postcode:e.target.value}))} placeholder="Postcode"/>
                  </div>
                </div>
              ) : null}
              <button type="button" className="one-kiosk-pay one-kiosk-stage-next" disabled={!basket.length} onClick={() => {
                try {
                  validateFulfilmentDetails();
                  const next = nextScreenFrom(fulfilmentScreen, "BASKET");
                  if (next?.key) setCurrentScreenKey(next.key);
                } catch (reason) { setError(reason?.message || "Complete fulfilment details"); }
              }}>Continue</button>
            </div>
          ) : null}

          {stageType === "FORM" ? (
            <div className="one-kiosk-stage one-kiosk-stage-narrow">
              <div className="one-kiosk-generic-form">
                <h2>{translate(currentScreen?.title) || "Order details"}</h2>
                {currentScreen?.subtitle ? <p>{translate(currentScreen.subtitle)}</p> : null}
                <div className="one-kiosk-form-grid">
                  {(Array.isArray(currentScreen?.fields) ? currentScreen.fields : []).map((field) => {
                    const value = journeyData[field.key] ?? (field.type === "checkbox" ? false : "");
                    const common = {
                      id: `kiosk-field-${field.key}`,
                      name: field.key,
                      required: field.required === true,
                    };
                    if (field.type === "textarea") {
                      return <label key={field.key} className="wide"><span>{translate(field.label) || field.key}{field.required ? " *" : ""}</span><textarea {...common} rows={4} value={String(value)} placeholder={translate(field.placeholder)} onChange={(e)=>setJourneyData((data)=>({...data,[field.key]:e.target.value}))}/></label>;
                    }
                    if (field.type === "select") {
                      return <label key={field.key}><span>{translate(field.label) || field.key}{field.required ? " *" : ""}</span><select {...common} value={String(value)} onChange={(e)=>setJourneyData((data)=>({...data,[field.key]:e.target.value}))}><option value="">Choose…</option>{(field.options || []).map((option)=><option key={typeof option==="string"?option:option.value} value={typeof option==="string"?option:option.value}>{translate(typeof option==="string"?option:option.label) || option.value}</option>)}</select></label>;
                    }
                    if (field.type === "checkbox") {
                      return <label key={field.key} className="wide one-kiosk-form-checkbox"><input {...common} type="checkbox" checked={Boolean(value)} onChange={(e)=>setJourneyData((data)=>({...data,[field.key]:e.target.checked}))}/><span>{translate(field.label) || field.key}{field.required ? " *" : ""}</span></label>;
                    }
                    return <label key={field.key}><span>{translate(field.label) || field.key}{field.required ? " *" : ""}</span><input {...common} type={["email","tel","number","date","time"].includes(field.type)?field.type:"text"} value={String(value)} placeholder={translate(field.placeholder)} onChange={(e)=>setJourneyData((data)=>({...data,[field.key]:e.target.value}))}/></label>;
                  })}
                </div>
              </div>
              <div className="one-kiosk-stage-actions">
                {currentScreen?.optional !== false ? <button type="button" onClick={() => { const next=nextScreenFrom(currentScreen,"BASKET"); if(next?.key)setCurrentScreenKey(next.key); }}>Skip</button> : <span />}
                <button type="button" className="one-kiosk-pay" onClick={() => {
                  const missing=(currentScreen?.fields||[]).find((field)=>field.required===true && (field.type==="checkbox" ? journeyData[field.key]!==true : !String(journeyData[field.key]??"").trim()));
                  if(missing){setError(`${translate(missing.label)||missing.key} is required`);return;}
                  const next=nextScreenFrom(currentScreen,"BASKET");
                  if(next?.key)setCurrentScreenKey(next.key);
                }}>Continue</button>
              </div>
            </div>
          ) : null}

          {stageType === "BASKET" ? (
            <div className="one-kiosk-stage one-kiosk-stage-narrow">
              <div className="one-kiosk-review-lines">
                {basket.map((line) => <div key={line.lineKey || line.id}><div><strong>{line.name}</strong><small>{line.modifiers?.map((item)=>item.name).join(" · ")}</small></div><span>{line.quantity} × {money(line.price,currency)}</span></div>)}
              </div>
              {Number(quote?.savings || 0) > 0 ? <div className="one-kiosk-savings">Offer savings {money(quote.savings,currency)}</div> : null}
              <div className="one-kiosk-total"><span>Total</span><strong>{money(total,currency)}</strong></div>
              <div className="one-kiosk-stage-actions">
                <button type="button" onClick={() => goToScreen("CATALOGUE")}>Add more items</button>
                <button type="button" className="one-kiosk-pay" disabled={!basket.length || quoteLoading} onClick={() => {
                  const next = nextScreenFrom(basketScreen, "PAYMENT");
                  if (next?.key) setCurrentScreenKey(next.key);
                }}>Continue to payment</button>
              </div>
            </div>
          ) : null}

          {stageType === "LOYALTY" ? (
            <div className="one-kiosk-stage one-kiosk-stage-narrow">
              <div className="one-kiosk-loyalty-card">
                <h2>{translateKey(`screen.${loyaltyScreen.key}.title`, loyaltyScreen.title) || "Rewards"}</h2>
                <p>{translateKey(`screen.${loyaltyScreen.key}.subtitle`, loyaltyScreen.subtitle) || "Enter your phone number or email, or continue as a guest."}</p>
                {customer ? (
                  <div className="one-kiosk-customer-found">
                    <CheckCircle2 size={28}/>
                    <div><strong>{customer.name || "Rewards account"}</strong><span>Balance: {Number(customer.loyalty_balance || 0).toLocaleString()} points</span></div>
                    <button type="button" onClick={() => { setCustomer(null); setCustomerLookup(""); setRedeemPoints(0); }}>Change</button>
                  </div>
                ) : (
                  <div className="one-kiosk-customer-search">
                    <input value={customerLookup} onChange={(e)=>setCustomerLookup(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") void lookupCustomer(); }} placeholder="Phone number or email" />
                    <button type="button" disabled={!customerLookup.trim() || customerLookupBusy} onClick={lookupCustomer}>{customerLookupBusy ? "Checking…" : "Find account"}</button>
                  </div>
                )}
                {customer?.loyalty_enabled && Number(customer?.loyalty_redeem_value_per_point || 0) > 0 && Number(customer?.loyalty_balance || 0) >= Number(customer?.loyalty_min_points_redeem || 0) ? (
                  <div className="one-kiosk-redeem-points">
                    <div>
                      <strong>Use points</strong>
                      <span>{redeemPoints > 0 ? `${redeemPoints} points · save ${money(loyaltyRedeemValue,currency)}` : "Choose how many points to use"}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={Math.max(0, Math.min(Number(customer.loyalty_balance || 0), Math.floor(total / Number(customer.loyalty_redeem_value_per_point || 1))))}
                      step="1"
                      value={Math.min(Number(redeemPoints || 0), Math.max(0, Math.min(Number(customer.loyalty_balance || 0), Math.floor(total / Number(customer.loyalty_redeem_value_per_point || 1)))))}
                      onChange={(e) => {
                        const next = Number(e.target.value || 0);
                        const min = Number(customer.loyalty_min_points_redeem || 0);
                        setRedeemPoints(next > 0 && next < min ? min : next);
                      }}
                    />
                    <div className="one-kiosk-redeem-actions">
                      <button type="button" onClick={()=>setRedeemPoints(0)}>No points</button>
                      <button type="button" onClick={()=>{
                        const maxByTotal=Math.floor(total / Number(customer.loyalty_redeem_value_per_point || 1));
                        setRedeemPoints(Math.min(Number(customer.loyalty_balance || 0),maxByTotal));
                      }}>Use maximum</button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="one-kiosk-stage-actions">
                <button type="button" onClick={() => { setCustomer(null); setCustomerLookup(""); const next=nextScreenFrom(loyaltyScreen,"PAYMENT"); if(next?.key)setCurrentScreenKey(next.key); }}>Continue as guest</button>
                <button type="button" className="one-kiosk-pay" onClick={() => { const next=nextScreenFrom(loyaltyScreen,"PAYMENT"); if(next?.key)setCurrentScreenKey(next.key); }}>{customer ? "Continue with rewards" : "Continue"}</button>
              </div>
            </div>
          ) : null}

          {stageType === "PAYMENT" ? (
            <div className="one-kiosk-stage one-kiosk-payment-stage">
              <CreditCard size={48}/>
              <h2>{translateKey(`screen.${paymentScreen.key}.title`, paymentScreen.title) || "Pay by card"}</h2>
              <p>{translateKey(`screen.${paymentScreen.key}.subtitle`, paymentScreen.subtitle) || "Follow the instructions on the card machine."}</p>
              {loyaltyRedeemValue > 0 ? <div className="one-kiosk-savings">Points applied: −{money(loyaltyRedeemValue,currency)}</div> : null}
              <div className="one-kiosk-total"><span>Total to pay</span><strong>{money(amountDue,currency)}</strong></div>
              <button type="button" className="one-kiosk-pay" disabled={!basket.length || paying || quoteLoading} onClick={payAndCollect}>
                <CreditCard size={20}/>{paying ? "Processing…" : paidSale ? "Finish order" : (translateKey(`screen.${paymentScreen.key}.actionLabel`, paymentScreen.actionLabel) || "Pay now")}
              </button>
              <button type="button" className="one-kiosk-secondary" disabled={paying || Boolean(paidSale)} onClick={() => goToScreen("BASKET")}>Back to order</button>
              <small className="one-kiosk-payment-note">{demoMode ? "Demo payment completes on-screen without charging a card." : `Using ${paymentRuntime?.name || "the assigned card machine"}.`}</small>
            </div>
          ) : null}
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

          {stageType === "CATALOGUE" || stageType === "PRODUCT_DETAIL" || stageType === "RECOMMENDATIONS" ? (
            <button type="button" className="one-kiosk-cart-continue" disabled={!basket.length} onClick={() => {
              const target = screenSequence.find((screen) => screen.type === "FULFILMENT") || screenSequence.find((screen) => screen.type === "BASKET") || screenSequence.find((screen) => screen.type === "PAYMENT");
              if (target?.key) setCurrentScreenKey(target.key);
            }}>Review order</button>
          ) : null}

          <div className="one-kiosk-total">
            <span>{quoteLoading ? "Checking price…" : "Total"}</span>
            <strong>{money(total, currency)}</strong>
          </div>
          {Number(quote?.savings || 0) > 0 ? <div className="one-kiosk-savings">You save {money(quote.savings, currency)}</div> : null}

          <small className="one-kiosk-payment-note">{stageType === "PAYMENT" ? "Complete payment in the main panel." : "Your basket stays with you through each step."}</small>
        </aside>
      </div>

      {pendingAgeProduct ? (
        <div className="one-kiosk-idle-overlay">
          <div>
            <strong>Staff approval required</strong>
            <span>This item is age restricted. A member of staff has been notified to verify your age.</span>
            <button type="button" onClick={() => setPendingAgeProduct(null)}>Cancel</button>
          </div>
        </div>
      ) : null}

      {idleWarning ? (
        <div className="one-kiosk-idle-overlay">
          <div><strong>Are you still there?</strong><span>Your order will reset shortly for privacy.</span><button type="button" onClick={() => { setLastInteractionAt(Date.now()); setIdleWarning(false); }}>Continue order</button></div>
        </div>
      ) : null}

      {productScreen.compare && compareIds.length ? (
        <div className="one-kiosk-compare-bar">
          <span><GitCompareArrows size={18}/> {compareIds.length} selected</span>
          <button type="button" disabled={compareIds.length < 2} onClick={() => setShowCompare(true)}>Compare</button>
          <button type="button" onClick={() => setCompareIds([])}>Clear</button>
        </div>
      ) : null}

      {showCompare && comparedProducts.length >= 2 ? (
        <div className="one-kiosk-compare-overlay" role="dialog" aria-modal="true" aria-label="Compare products">
          <div className="one-kiosk-compare-panel">
            <div className="one-kiosk-compare-head"><h2>Compare products</h2><button type="button" onClick={() => setShowCompare(false)}>×</button></div>
            <div className="one-kiosk-compare-table">
              <div className="label">Product</div>
              {comparedProducts.map((product) => <div key={product.id} className="product"><strong>{product.name}</strong><span>{money(product.price,currency)}</span></div>)}
              {Array.from(new Set(comparedProducts.flatMap((product) => Object.keys(product.kiosk_metadata?.specifications || product.kioskMetadata?.specifications || {})))).map((spec) => (
                <Fragment key={spec}>
                  <div className="label">{spec}</div>
                  {comparedProducts.map((product) => <div key={`${product.id}-${spec}`}>{String((product.kiosk_metadata?.specifications || product.kioskMetadata?.specifications || {})[spec] ?? "—")}</div>)}
                </Fragment>
              ))}
              <div className="label">Availability</div>
              {comparedProducts.map((product) => <div key={`${product.id}-stock`}>{product.track_stock === false ? "Available" : Number(product.store_stock || 0) > 0 ? `${Number(product.store_stock)} in stock` : "Out of stock"}</div>)}
            </div>
            <button type="button" className="one-kiosk-pay" onClick={() => setShowCompare(false)}>Done</button>
          </div>
        </div>
      ) : null}

      {publicMode ? <button type="button" className="one-kiosk-staff-exit" onClick={exitKioskMode} aria-label="Exit kiosk mode"><LogOut size={16}/><span>Staff</span></button> : null}

      {featureFlags.assistance ? <button type="button" className="one-kiosk-help" onClick={requestAssistance}><HelpCircle size={20}/> Need help?</button> : null}

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
              {Array.isArray(productOptions?.bundleComponents) && productOptions.bundleComponents.length ? (
                <div className="one-kiosk-bundle-contents">
                  <strong>Includes</strong>
                  <div>
                    {productOptions.bundleComponents.map((component) => (
                      <span key={component.id}>{component.quantity > 1 ? `${component.quantity}× ` : ""}{component.name}</span>
                    ))}
                  </div>
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
              {productScreen.compare ? (
                <button
                  type="button"
                  className={`one-kiosk-compare-toggle ${compareIds.includes(String(selectedProduct.id)) ? "is-active" : ""}`}
                  onClick={() => setCompareIds((current) => current.includes(String(selectedProduct.id))
                    ? current.filter((id) => id !== String(selectedProduct.id))
                    : [...current.filter((id) => id !== String(selectedProduct.id)), String(selectedProduct.id)].slice(-3))}
                >
                  <GitCompareArrows size={18}/>
                  {compareIds.includes(String(selectedProduct.id)) ? "Remove from comparison" : "Add to comparison"}
                </button>
              ) : null}
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
