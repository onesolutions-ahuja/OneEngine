import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, MapPin, Phone, RefreshCw, Truck } from "lucide-react";
import { apiRequest } from "../../services/api.js";
import { getConnectivity, subscribeConnectivity } from "../../services/connectivity.js";
import { buildDirectionsUrl } from "./directionsAdapter.js";

const STATUS_LABELS = {
  RECEIVED: "New order",
  PREPARING: "Preparing",
  READY_FOR_DELIVERY: "Ready for dispatch",
  DRIVER_ACCEPTED: "Accepted",
  COLLECTED: "Collected",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Delivered",
  FAILED_DELIVERY: "Unable to deliver",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

function deliveryAddress(order) {
  return String(order.delivery_address || "").trim();
}

function StatusBadge({ status }) {
  return <span className={`delivery-status delivery-status-${String(status || "new").toLowerCase()}`}>{STATUS_LABELS[status] || status}</span>;
}

function isOffline(connectivity) {
  return connectivity.internet === "disconnected" || connectivity.server === "unreachable";
}

export default function OwnDeliveryWorkspace() {
  const [mode, setMode] = useState(null);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [driverSelections, setDriverSelections] = useState({});
  const [note, setNote] = useState("");
  const [busyOrder, setBusyOrder] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [connectivity, setConnectivity] = useState(getConnectivity());
  const offline = isOffline(connectivity);

  useEffect(() => subscribeConnectivity(setConnectivity), []);

  async function loadJobs() {
    try {
      setError("");
      const response = mode === "driver"
        ? await apiRequest("/api/own-delivery/my-jobs")
        : await apiRequest(`/api/own-delivery/orders?storeId=${encodeURIComponent(storeId)}`);
      setOrders(response.data || []);
    } catch (reason) {
      setError(reason.message || "Unable to load deliveries");
    }
  }

  async function initialize() {
    try {
      const response = await apiRequest("/api/auth/me/permissions");
      const permissions = response.data?.permissions || [];
      const driverOnly = permissions.includes("delivery.driver") && response.data?.isAdmin !== true && !permissions.includes("online_orders.manage");
      setMode(driverOnly ? "driver" : "dispatcher");
      if (driverOnly) return;
      const storeResponse = await apiRequest("/api/own-delivery/stores");
      const accessibleStores = storeResponse.data || [];
      setStores(accessibleStores);
      const token = localStorage.getItem("onepos_token");
      let sessionStoreId = "";
      try { sessionStoreId = JSON.parse(atob((token || "").split(".")[1] || "")).storeId || ""; } catch { /* Server remains authoritative. */ }
      const selected = accessibleStores.find((store) => store.id === sessionStoreId) || accessibleStores[0];
      if (selected) setStoreId(selected.id);
      else setError("No stores are available to this dispatcher.");
    } catch (reason) {
      setError(reason.message || "Unable to open Own Delivery");
      setMode("denied");
    }
  }

  useEffect(() => { void initialize(); }, []);
  useEffect(() => {
    if (!mode || mode === "denied") return;
    if (mode === "dispatcher" && !storeId) return;
    void loadJobs();
    if (mode === "dispatcher") {
      apiRequest(`/api/own-delivery/drivers?storeId=${encodeURIComponent(storeId)}`)
        .then((response) => setDrivers(response.data || []))
        .catch((reason) => setError(reason.message || "Unable to load delivery partners"));
    }
  }, [mode, storeId]);

  async function assign(orderId, driverId) {
    if (!driverId || offline) return;
    setBusyOrder(orderId);
    setMessage("");
    try {
      await apiRequest(`/api/own-delivery/orders/${encodeURIComponent(orderId)}/assignment`, {
        method: "PUT", body: JSON.stringify({ driverId }),
      });
      setMessage("Delivery partner assigned.");
      await loadJobs();
    } catch (reason) {
      setError(reason.message || "Unable to assign delivery partner");
    } finally {
      setBusyOrder("");
    }
  }

  async function updateStatus(order, action) {
    if (offline) return;
    setBusyOrder(order.id);
    setMessage("");
    try {
      await apiRequest(`/api/own-delivery/my-jobs/${encodeURIComponent(order.id)}/actions`, {
        method: "POST", body: JSON.stringify({ action, note: note.trim() }),
      });
      setNote("");
      setMessage(action === "delivered" ? "Delivery marked delivered." : action === "failed" ? "Unable-to-deliver status recorded." : "Delivery updated.");
      await loadJobs();
    } catch (reason) {
      setError(reason.message || "Unable to update delivery");
    } finally {
      setBusyOrder("");
    }
  }

  async function moveStop(index, delta) {
    if (offline) return;
    const next = [...orders];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrders(next);
    try {
      await apiRequest("/api/own-delivery/my-jobs/route", {
        method: "PUT", body: JSON.stringify({ orderIds: next.map((order) => order.id) }),
      });
    } catch (reason) {
      setError(reason.message || "Unable to save stop order");
      await loadJobs();
    }
  }

  if (!mode) return <main className="min-h-screen grid place-items-center p-6 text-sm text-slate-500">Loading delivery workspace...</main>;
  if (mode === "denied") return <main className="min-h-screen grid place-items-center p-6"><p role="alert">{error || "You do not have access to Own Delivery."}</p></main>;

  return (
    <main className="delivery-workspace min-h-screen bg-slate-50 text-slate-900">
      <header className="delivery-header">
        <div className="delivery-heading-mark"><Truck size={21} /></div>
        <div className="min-w-0 flex-1"><p>{mode === "driver" ? "Driver workspace" : "Dispatch"}</p><h1>{mode === "driver" ? "My deliveries" : "Own Delivery"}</h1></div>
        <button type="button" className="delivery-icon-button" title="Refresh deliveries" aria-label="Refresh deliveries" onClick={() => void loadJobs()}><RefreshCw size={18} /></button>
      </header>
      {offline && <div className="delivery-offline" role="status">Offline · showing the last loaded assignments read-only</div>}
      {message && <p className="delivery-message" role="status">{message}</p>}
      {error && <p className="delivery-error" role="alert">{error}</p>}
      {mode === "dispatcher" && <div className="delivery-toolbar">
        <label>Store<select value={storeId} onChange={(event) => setStoreId(event.target.value)} aria-label="Store">
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select></label>
        <span>{orders.length} own deliveries</span>
      </div>}
      {mode === "driver" && <section className="delivery-route-summary"><strong>Today</strong><span>{orders.length} assigned stops</span></section>}
      <section className="delivery-list" aria-label={mode === "driver" ? "Assigned deliveries" : "Delivery queue"}>
        {orders.length === 0 ? <div className="delivery-empty"><Truck size={24} /><p>{mode === "driver" ? "No deliveries assigned." : "No own-delivery orders for this store."}</p></div> : orders.map((order, index) => {
          const address = deliveryAddress(order);
          const mapsPlatform = /iPhone|iPad|iPod/i.test(navigator.userAgent || "") ? "ios" : "web";
          const directions = address ? buildDirectionsUrl(address, { platform: mapsPlatform }) : null;
          return <article key={order.id} className="delivery-card">
            {mode === "driver" && <div className="delivery-stop-number">{index + 1}</div>}
            <div className="delivery-card-main">
              <div className="delivery-card-top"><strong>{order.external_reference || order.id}</strong><StatusBadge status={order.status} /></div>
              <h2>{order.customer_name || "Customer"}</h2>
              <p className="delivery-address"><MapPin size={16} />{address || "No delivery address"}</p>
              {mode === "driver" && <p className="delivery-pickup">Pickup: {order.store_name}{order.store_address ? ` · ${order.store_address}` : ""}</p>}
              {order.delivery_notes && <p className="delivery-notes">{order.delivery_notes}</p>}
              {order.delivery_status_note && <p className="delivery-notes">Latest note: {order.delivery_status_note}</p>}
              {Array.isArray(order.items) && order.items.length > 0 && <p className="delivery-items">{order.items.map((item) => `${item.quantity} × ${item.name}`).join(" · ")}</p>}
              <div className="delivery-actions">
                {order.customer_phone && <a href={`tel:${encodeURIComponent(order.customer_phone)}`} aria-label={`Call ${order.customer_name || "customer"}`}><Phone size={17} /><span>Call</span></a>}
                {directions && <a href={directions} target="_blank" rel="noreferrer" aria-label="Open directions"><MapPin size={17} /><span>Directions</span><ExternalLink size={13} /></a>}
                {mode === "driver" && <>
                  {order.status === "READY_FOR_DELIVERY" && <button type="button" disabled={offline || busyOrder === order.id} onClick={() => updateStatus(order, "accept")}>Accept</button>}
                  {order.status === "DRIVER_ACCEPTED" && <button type="button" disabled={offline || busyOrder === order.id} onClick={() => updateStatus(order, "collected")}>Collected</button>}
                  {order.status === "COLLECTED" && <button type="button" disabled={offline || busyOrder === order.id} onClick={() => updateStatus(order, "start")}>Start delivery</button>}
                  {order.status === "OUT_FOR_DELIVERY" && <button type="button" disabled={offline || busyOrder === order.id} onClick={() => updateStatus(order, "delivered")}>Delivered</button>}
                  {["DRIVER_ACCEPTED", "COLLECTED", "OUT_FOR_DELIVERY"].includes(order.status) && <button type="button" className="delivery-fail-action" disabled={offline || busyOrder === order.id} onClick={() => updateStatus(order, "failed")}>Unable to deliver</button>}
                </>}
              </div>
              {mode === "dispatcher" && <label className="delivery-assign">{order.driver_name ? "Assigned partner" : "Assign partner"}<select
                value={driverSelections[order.id] || order.delivery_driver_id || ""}
                disabled={offline || busyOrder === order.id || ["COMPLETED", "CANCELLED", "FAILED_DELIVERY", "RETURNED"].includes(order.status)}
                onChange={(event) => { setDriverSelections((current) => ({ ...current, [order.id]: event.target.value })); void assign(order.id, event.target.value); }}
              ><option value="">Unassigned</option>{drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name || driver.username}</option>)}</select></label>}
            </div>
            {mode === "driver" && <div className="delivery-stop-controls"><button type="button" title="Move stop up" aria-label="Move stop up" disabled={offline || index === 0} onClick={() => void moveStop(index, -1)}><ArrowUp size={17} /></button><button type="button" title="Move stop down" aria-label="Move stop down" disabled={offline || index === orders.length - 1} onClick={() => void moveStop(index, 1)}><ArrowDown size={17} /></button></div>}
          </article>;
        })}
      </section>
      {mode === "driver" && orders.some((order) => ["DRIVER_ACCEPTED", "COLLECTED", "OUT_FOR_DELIVERY"].includes(order.status)) && <label className="delivery-note-editor">Delivery note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} placeholder="Add a note for this delivery" /></label>}
    </main>
  );
}
