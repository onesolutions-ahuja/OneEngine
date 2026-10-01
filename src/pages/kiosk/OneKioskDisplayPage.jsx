import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "../../services/api.js";
import "./oneKioskDisplay.css";

const DISPLAY_FLOW_KEY = "onepos_kiosk_display_flow_id";

export default function OneKioskDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [flows, setFlows] = useState([]);
  const [flowId, setFlowId] = useState(() => {
    try { return localStorage.getItem(DISPLAY_FLOW_KEY) || ""; } catch { return ""; }
  });

  const load = useCallback(async () => {
    try {
      const [response, flowResponse] = await Promise.all([
        apiRequest("/api/online/orders?platform=one_kiosk&limit=100"),
        apiRequest("/api/kiosk/flows").catch(() => ({ data: [] })),
      ]);
      if (!response?.success) throw new Error(response?.message || "Unable to load kiosk orders");
      const nextFlows = Array.isArray(flowResponse?.data) ? flowResponse.data : [];
      setOrders(Array.isArray(response.data) ? response.data : []);
      setFlows(nextFlows);
      setFlowId((current) => {
        if (current && nextFlows.some((flow) => String(flow.id) === String(current))) return current;
        const preferred = nextFlows.find((flow) => flow?.action?.defaultForNewDevices === true) || nextFlows[0];
        const next = preferred?.id || "";
        try {
          if (next) localStorage.setItem(DISPLAY_FLOW_KEY, next);
          else localStorage.removeItem(DISPLAY_FLOW_KEY);
        } catch {}
        return next;
      });
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

  const selectedFlow = useMemo(
    () => flows.find((flow) => String(flow.id) === String(flowId)) || flows[0] || null,
    [flows, flowId]
  );
  const display = selectedFlow?.action?.ui?.orderDisplay || {};
  const activeStatuses = useMemo(() => new Set(Array.isArray(display.activeStatuses) && display.activeStatuses.length ? display.activeStatuses : ["PREPARING","ACCEPTED"]), [JSON.stringify(display.activeStatuses || [])]);
  const readyStatuses = useMemo(() => new Set(Array.isArray(display.readyStatuses) && display.readyStatuses.length ? display.readyStatuses : ["READY","READY_FOR_PICKUP"]), [JSON.stringify(display.readyStatuses || [])]);
  const visibleOrders = useMemo(
    () => flowId ? orders.filter((order) => !order.platform_data?.workflowId || String(order.platform_data.workflowId) === String(flowId)) : orders,
    [orders, flowId]
  );
  const preparing = useMemo(() => visibleOrders.filter((order) => activeStatuses.has(order.status)), [visibleOrders, activeStatuses]);
  const ready = useMemo(() => visibleOrders.filter((order) => readyStatuses.has(order.status)), [visibleOrders, readyStatuses]);

  return (
    <main className="one-kiosk-display">
      <header>
        <div>
          <span>OneKiosk</span>
          <h1>{display.title || "Order collection"}</h1>
        </div>
        <div className="one-kiosk-display-actions">
          {flows.length > 1 ? <select value={flowId} onChange={(event) => {
            const next = event.target.value;
            setFlowId(next);
            try { localStorage.setItem(DISPLAY_FLOW_KEY, next); } catch {}
          }}>{flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}</select> : null}
          <button type="button" onClick={load}><RefreshCw size={20}/> Refresh</button>
        </div>
      </header>

      {error ? <div className="one-kiosk-display-error">{error}</div> : null}

      <section className="one-kiosk-display-grid">
        <div className="one-kiosk-display-column is-preparing">
          <h2>{display.activeLabel || "Preparing"}</h2>
          <div className="one-kiosk-display-numbers">
            {preparing.map((order) => <strong key={order.id}>{order.external_reference || order.external_order_id}</strong>)}
            {!preparing.length ? <span>{display.activeEmpty || "No orders preparing"}</span> : null}
          </div>
        </div>

        <div className="one-kiosk-display-column is-ready">
          <h2>{display.readyLabel || "Ready to collect"}</h2>
          <div className="one-kiosk-display-numbers">
            {ready.map((order) => <strong key={order.id}>{order.external_reference || order.external_order_id}</strong>)}
            {!ready.length ? <span>{display.readyEmpty || "No orders ready"}</span> : null}
          </div>
        </div>
      </section>

      <footer>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Loading…"}</footer>
    </main>
  );
}
