import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest, KIOSK_DISPLAY_TOKEN_STORAGE_KEY, lockToKioskDisplayMode } from "../../services/api.js";
import "./oneKioskDisplay.css";

const DISPLAY_FLOW_KEY = "onepos_kiosk_display_flow_id";

export default function OneKioskDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [displayReady, setDisplayReady] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [flows, setFlows] = useState([]);
  const [flowId, setFlowId] = useState(() => {
    try { return localStorage.getItem(DISPLAY_FLOW_KEY) || ""; } catch { return ""; }
  });

  const provisionDisplay = useCallback(async () => {
    const existing = (() => {
      try { return localStorage.getItem(KIOSK_DISPLAY_TOKEN_STORAGE_KEY) || ""; } catch { return ""; }
    })();
    if (existing) {
      setDisplayReady(true);
      return true;
    }
    setProvisioning(true);
    try {
      const response = await apiRequest("/api/kiosk/display-session", {
        method: "POST",
        body: JSON.stringify({ flowId: flowId || null }),
      });
      if (!response?.success || !response?.data?.modeToken) {
        throw new Error(response?.message || "Unable to secure this collection display");
      }
      try {
        localStorage.setItem(KIOSK_DISPLAY_TOKEN_STORAGE_KEY, response.data.modeToken);
        if (response.data.flowId) {
          localStorage.setItem(DISPLAY_FLOW_KEY, response.data.flowId);
          setFlowId(response.data.flowId);
        }
      } catch {}
      lockToKioskDisplayMode();
      setDisplayReady(true);
      return true;
    } catch (reason) {
      setError(reason?.message || "Unable to provision collection display");
      return false;
    } finally {
      setProvisioning(false);
    }
  }, [flowId]);

  const load = useCallback(async () => {
    try {
      const [response, flowResponse] = await Promise.all([
        apiRequest("/api/online/orders?platform=one_kiosk&limit=100"),
        apiRequest("/api/platform/rules").catch(() => ({ data: [] })),
      ]);
      if (!response?.success) throw new Error(response?.message || "Unable to load kiosk orders");
      const nextFlows = (Array.isArray(flowResponse?.data) ? flowResponse.data : []).filter((flow) => flow?.action?.type === "workflow" && flow?.action?.scope === "one_kiosk" && flow?.action?.flowType === "KIOSK_EXPERIENCE" && flow?.active !== false);
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
    if (!document.hidden) void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
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

  if (!displayReady) {
    return (
      <main className="one-kiosk-display one-kiosk-display-provision">
        <section>
          <span>OneKiosk</span>
          <h1>{provisioning ? "Securing collection display…" : "Collection display setup"}</h1>
          <p>{error || "Open this screen once while signed in as authorised staff. It will then run in read-only display mode."}</p>
          {!provisioning ? <button type="button" onClick={provisionDisplay}>Start display</button> : null}
        </section>
      </main>
    );
  }

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
