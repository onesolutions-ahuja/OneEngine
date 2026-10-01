import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "../../services/api.js";
import "./oneKioskDisplay.css";

const ACTIVE = new Set(["PREPARING", "ACCEPTED"]);
const READY = new Set(["READY", "READY_FOR_PICKUP"]);

export default function OneKioskDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await apiRequest("/api/online/orders?platform=one_kiosk&limit=100");
      if (!response?.success) throw new Error(response?.message || "Unable to load kiosk orders");
      setOrders(Array.isArray(response.data) ? response.data : []);
      setUpdatedAt(new Date());
      setError("");
    } catch (reason) {
      setError(reason?.message || "Unable to load kiosk orders");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const preparing = useMemo(() => orders.filter((order) => ACTIVE.has(order.status)), [orders]);
  const ready = useMemo(() => orders.filter((order) => READY.has(order.status)), [orders]);

  return (
    <main className="one-kiosk-display">
      <header>
        <div>
          <span>OneKiosk</span>
          <h1>Order collection</h1>
        </div>
        <button type="button" onClick={load}><RefreshCw size={20}/> Refresh</button>
      </header>

      {error ? <div className="one-kiosk-display-error">{error}</div> : null}

      <section className="one-kiosk-display-grid">
        <div className="one-kiosk-display-column is-preparing">
          <h2>Preparing</h2>
          <div className="one-kiosk-display-numbers">
            {preparing.map((order) => <strong key={order.id}>{order.external_reference || order.external_order_id}</strong>)}
            {!preparing.length ? <span>No orders preparing</span> : null}
          </div>
        </div>

        <div className="one-kiosk-display-column is-ready">
          <h2>Ready to collect</h2>
          <div className="one-kiosk-display-numbers">
            {ready.map((order) => <strong key={order.id}>{order.external_reference || order.external_order_id}</strong>)}
            {!ready.length ? <span>No orders ready</span> : null}
          </div>
        </div>
      </section>

      <footer>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Loading…"}</footer>
    </main>
  );
}
