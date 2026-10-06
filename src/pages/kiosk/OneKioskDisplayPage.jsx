import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { apiRequest, KIOSK_DISPLAY_TOKEN_STORAGE_KEY, lockToKioskDisplayMode } from "../../services/api.js";
import { loadRuntimeSurface, runtimeEndpoint } from "../../services/runtimeSurface";
import "./oneKioskDisplay.css";

const DISPLAY_FLOW_KEY = "onepos_kiosk_display_flow_id";

export default function OneKioskDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [displayReady, setDisplayReady] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [flows, setFlows] = useState([]);
  const [runtimeSurface, setRuntimeSurface] = useState(null);
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
      const surface = runtimeSurface || await loadRuntimeSurface("kiosk-display", "collectionDisplay");
      setRuntimeSurface(surface);
      const displaySessionEndpoint = runtimeEndpoint(surface, "displaySession");
      if (!displaySessionEndpoint) throw new Error("Collection display session metadata is unavailable");
      const response = await apiRequest(displaySessionEndpoint, {
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
      const surface = runtimeSurface || await loadRuntimeSurface("kiosk-display", "collectionDisplay");
      setRuntimeSurface(surface);
      const orderObjectKey = String(surface?.objects?.order || "");
      const platformField = String(surface?.filters?.platformField || "");
      const platformValue = surface?.filters?.platformValue;
      if (!orderObjectKey) throw new Error("Collection display object metadata is unavailable");
      const filter = platformField ? encodeURIComponent(JSON.stringify({ [platformField]: platformValue })) : "";
      const orderPath = `/api/platform/objects/${encodeURIComponent(orderObjectKey)}/records?page=1&pageSize=100${filter ? `&filter=${filter}` : ""}`;
      const [response, flowResponse] = await Promise.all([
        apiRequest(orderPath),
        runtimeEndpoint(surface, "flows") ? apiRequest(runtimeEndpoint(surface, "flows")).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      ]);
      const nextFlows = Array.isArray(flowResponse?.data) ? flowResponse.data : [];
      const orderRows = Array.isArray(response?.records) ? response.records : Array.isArray(response?.data) ? response.data : [];
      setOrders(orderRows);
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
  }, [runtimeSurface]);

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
  const activeStatuses = useMemo(() => new Set(Array.isArray(display.activeStatuses) && display.activeStatuses.length ? display.activeStatuses : (runtimeSurface?.statusSets?.active || [])), [JSON.stringify(display.activeStatuses || []), JSON.stringify(runtimeSurface?.statusSets?.active || [])]);
  const readyStatuses = useMemo(() => new Set(Array.isArray(display.readyStatuses) && display.readyStatuses.length ? display.readyStatuses : (runtimeSurface?.statusSets?.ready || [])), [JSON.stringify(display.readyStatuses || []), JSON.stringify(runtimeSurface?.statusSets?.ready || [])]);
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
