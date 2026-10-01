import { useCallback, useEffect, useMemo, useState } from "react";
import { CreditCard, Monitor, Printer, RefreshCw, Save, Wifi, WifiOff } from "lucide-react";
import { apiRequest } from "../../services/api.js";
import "./oneKioskDevices.css";

function statusTone(status) {
  const value = String(status || "UNKNOWN").toUpperCase();
  if (["ONLINE","READY","CONNECTED"].includes(value)) return "is-online";
  if (["DEGRADED","NOT_CONFIGURED"].includes(value)) return "is-warning";
  if (["OFFLINE","ERROR","UNAVAILABLE"].includes(value)) return "is-offline";
  return "is-unknown";
}

function StatusPill({ status }) {
  const value = String(status || "UNKNOWN").replaceAll("_", " ");
  return <span className={`kiosk-device-pill ${statusTone(status)}`}>{value}</span>;
}

export default function OneKioskDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [paymentConnectors, setPaymentConnectors] = useState([]);
  const [printerConnectors, setPrinterConnectors] = useState([]);
  const [flows, setFlows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderResults, setOrderResults] = useState([]);
  const [orderSearchBusy, setOrderSearchBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [deviceResponse, terminalResponse, paymentConnectorResponse, printerConnectorResponse, flowResponse] = await Promise.all([
        apiRequest("/api/kiosk/devices"),
        apiRequest("/api/payment-terminals").catch(() => ({ data: [] })),
        apiRequest("/api/kiosk/payment-connectors").catch(() => ({ data: [] })),
        apiRequest("/api/kiosk/printer-connectors").catch(() => ({ data: [] })),
        apiRequest("/api/kiosk/flows").catch(() => ({ data: [] })),
      ]);
      if (!deviceResponse?.success) throw new Error(deviceResponse?.message || "Unable to load kiosk devices");
      const rows = Array.isArray(deviceResponse.data) ? deviceResponse.data : [];
      setDevices(rows);
      setTerminals(Array.isArray(terminalResponse?.data) ? terminalResponse.data : []);
      setPaymentConnectors(Array.isArray(paymentConnectorResponse?.data) ? paymentConnectorResponse.data : []);
      setPrinterConnectors(Array.isArray(printerConnectorResponse?.data) ? printerConnectorResponse.data : []);
      setFlows(Array.isArray(flowResponse?.data) ? flowResponse.data : []);
      const nextId = selectedId && rows.some((row) => row.id === selectedId) ? selectedId : rows[0]?.id || "";
      setSelectedId(nextId);
      const selected = rows.find((row) => row.id === nextId);
      if (selected) setDraft({
        name: selected.name || "OneKiosk",
        workflowId: selected.workflow_id || "",
        active: selected.active !== false,
        paymentConnectorId: selected.payment_connector_id || "",
        printerConnectorId: selected.printer_connector_id || "",
        paymentTerminalId: selected.payment_terminal_id || "",
        paymentRequired: selected.payment_required !== false,
        printerRequired: selected.printer_required === true,
        printerName: selected.printer_name || "",
        printerConnectionType: selected.printer_connection_type || "NETWORK",
        printerConnectionAddress: selected.printer_connection_address || "",
        printerPaperWidth: selected.printer_paper_width || "80mm",
      });
      else setDraft(null);
    } catch (reason) {
      setError(reason?.message || "Unable to load kiosk devices");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(); }, []);

  const selected = useMemo(() => devices.find((row) => row.id === selectedId) || null, [devices, selectedId]);

  const selectDevice = (device) => {
    setSelectedId(device.id);
    setDraft({
      name: device.name || "OneKiosk",
      workflowId: device.workflow_id || "",
      active: device.active !== false,
      paymentConnectorId: device.payment_connector_id || "",
      printerConnectorId: device.printer_connector_id || "",
      paymentTerminalId: device.payment_terminal_id || "",
      paymentRequired: device.payment_required !== false,
      printerRequired: device.printer_required === true,
      printerName: device.printer_name || "",
      printerConnectionType: device.printer_connection_type || "NETWORK",
      printerConnectionAddress: device.printer_connection_address || "",
      printerPaperWidth: device.printer_paper_width || "80mm",
    });
  };

  const searchOrders = async () => {
    setOrderSearchBusy(true);
    setError("");
    try {
      const response = await apiRequest(`/api/kiosk/orders/search?q=${encodeURIComponent(orderSearch.trim())}&limit=20`);
      if (!response?.success) throw new Error(response?.message || "Unable to search kiosk orders");
      setOrderResults(Array.isArray(response.data) ? response.data : []);
    } catch (reason) {
      setError(reason?.message || "Unable to search kiosk orders");
    } finally {
      setOrderSearchBusy(false);
    }
  };

  const save = async () => {
    if (!selected || !draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await apiRequest(`/api/kiosk/devices/${selected.id}/settings`, {
        method: "PUT",
        body: JSON.stringify({
          ...draft,
          workflowId: draft.workflowId || null,
          paymentConnectorId: draft.paymentConnectorId || null,
          printerConnectorId: draft.printerConnectorId || null,
          paymentTerminalId: draft.paymentTerminalId || null,
        }),
      });
      if (!response?.success) throw new Error(response?.message || "Unable to save kiosk settings");
      await load();
    } catch (reason) {
      setError(reason?.message || "Unable to save kiosk settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="kiosk-devices-page">
      <header className="kiosk-devices-header">
        <div>
          <span>OneKiosk</span>
          <h1>Kiosk devices</h1>
          <p>Monitor every kiosk and manage its own payment terminal, printer and connectivity settings.</p>
        </div>
        <div className="kiosk-devices-header-actions">
          <button type="button" onClick={() => {
            const currentPath = window.location.pathname;
            const base = currentPath.includes("/app/") ? currentPath.slice(0, currentPath.indexOf("/app/")) : "";
            window.location.assign(`${base}/app/kiosk`);
          }}><Monitor size={17}/> Open kiosk</button>
          <button type="button" onClick={load} disabled={loading}><RefreshCw size={17}/> Refresh</button>
        </div>
      </header>

      {error ? <div className="kiosk-devices-error">{error}</div> : null}

      <section className="kiosk-order-recovery">
        <div className="kiosk-order-recovery-head">
          <div><strong>Find kiosk order</strong><span>Search collection number, receipt, amount or kiosk name.</span></div>
          <div><input value={orderSearch} onChange={(e)=>setOrderSearch(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter") void searchOrders();}} placeholder="e.g. K103, £11.27, Kiosk 02"/><button type="button" onClick={searchOrders} disabled={orderSearchBusy}>{orderSearchBusy ? "Searching…" : "Search"}</button></div>
        </div>
        {orderResults.length ? <div className="kiosk-order-results">
          {orderResults.map((order) => (
            <div key={order.id}>
              <div><strong>{order.external_reference || order.external_order_id || "Kiosk order"}</strong><span>{order.kiosk_name || "OneKiosk"} · {order.created_at ? new Date(order.created_at).toLocaleString() : ""}</span></div>
              <div><span>{order.receipt_number || "No receipt"}</span><strong>{order.total != null ? new Intl.NumberFormat(undefined,{style:"currency",currency:order.currency || "GBP"}).format(Number(order.total)) : ""}</strong></div>
              <StatusPill status={order.status} />
            </div>
          ))}
        </div> : null}
      </section>

      <div className="kiosk-devices-layout">
        <aside className="kiosk-devices-list">
          <div className="kiosk-devices-list-title"><strong>Devices</strong><span>{devices.length}</span></div>
          {devices.map((device) => (
            <button key={device.id} type="button" className={selectedId === device.id ? "is-selected" : ""} onClick={() => selectDevice(device)}>
              <span className={`kiosk-device-dot ${statusTone(device.overall_status)}`} />
              <div><strong>{device.name}</strong><small>{device.device_key}</small></div>
              <StatusPill status={device.overall_status} />
            </button>
          ))}
          {!loading && !devices.length ? <div className="kiosk-devices-empty">Open OneKiosk on a device once and it will register here automatically.</div> : null}
        </aside>

        <section className="kiosk-device-detail">
          {!selected || !draft ? (
            <div className="kiosk-device-placeholder"><Monitor size={36}/><strong>Select a kiosk</strong><span>Device health and hardware settings will appear here.</span></div>
          ) : (
            <>
              {selected.age_approval_requested_at ? (
                <div className="kiosk-device-assistance">
                  <div><strong>Age verification requested</strong><span>Customer is waiting at this kiosk · {new Date(selected.age_approval_requested_at).toLocaleTimeString()}</span></div>
                  <button type="button" onClick={async () => {
                    const response = await apiRequest(`/api/kiosk/devices/${selected.id}/age-approve`, { method: "POST", body: JSON.stringify({ minutes: 5 }) });
                    if (!response?.success) throw new Error(response?.message || "Unable to approve age check");
                    await load();
                  }}>Approve after ID check</button>
                </div>
              ) : null}
              {selected.assistance_requested_at ? (
                <div className="kiosk-device-assistance">
                  <div><strong>Customer needs help</strong><span>{selected.assistance_note || "Assistance requested"} · {new Date(selected.assistance_requested_at).toLocaleTimeString()}</span></div>
                  <button type="button" onClick={async () => {
                    await apiRequest(`/api/kiosk/devices/${selected.id}/assistance-clear`, { method: "POST", body: JSON.stringify({}) });
                    await load();
                  }}>Mark resolved</button>
                </div>
              ) : null}
              <div className="kiosk-device-summary">
                <div>
                  <span className={`kiosk-device-dot large ${statusTone(selected.overall_status)}`} />
                  <div><h2>{selected.name}</h2><p>Last seen {selected.last_heartbeat_at ? new Date(selected.last_heartbeat_at).toLocaleString() : "never"}</p></div>
                </div>
                <StatusPill status={selected.overall_status} />
              </div>

              <div className="kiosk-health-grid">
                <div><Wifi size={20}/><span>Internet</span><StatusPill status={selected.internet_status} /></div>
                <div><Monitor size={20}/><span>onePOS server</span><StatusPill status={selected.server_status} /></div>
                <div><CreditCard size={20}/><span>Card terminal</span><StatusPill status={selected.effective_payment_status || selected.payment_status} /></div>
                <div><Printer size={20}/><span>Receipt printer</span><StatusPill status={selected.effective_printer_status || selected.printer_status} /></div>
              </div>

              <div className="kiosk-device-section">
                <h3>Device</h3>
                <label><span>Name</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}/></label>
                <label><span>Experience flow</span>
                  <select value={draft.workflowId} onChange={(e) => setDraft((d) => ({ ...d, workflowId: e.target.value }))}>
                    <option value="">Use package default flow</option>
                    {flows.map((flow) => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name}{flow.user_modified ? " · customised" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="kiosk-device-current">
                  <span>Journey source</span>
                  <strong>{flows.find((flow) => flow.id === draft.workflowId)?.name || "Package default"}</strong>
                  <small>Duplicate or edit this workflow in Developer mode to change the kiosk experience without code changes.</small>
                </div>
                <label className="kiosk-device-toggle"><span><strong>Active</strong><small>Disable this kiosk without deleting its configuration.</small></span><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}/></label>
              </div>

              <div className="kiosk-device-section">
                <h3><CreditCard size={18}/> Card machine</h3>
                <label><span>Assigned One Connect card machine</span>
                  <select value={draft.paymentConnectorId} onChange={(e) => setDraft((d) => ({ ...d, paymentConnectorId: e.target.value }))}>
                    <option value="">No payment connector assigned</option>
                    {paymentConnectors.map((connector) => (
                      <option key={connector.id} value={connector.id}>
                        {connector.name} · {connector.connector_package_key} · {connector.till_name || connector.terminal_number || "terminal"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="kiosk-device-toggle"><span><strong>Payment required</strong><small>Mark the kiosk degraded if its card machine is unavailable.</small></span><input type="checkbox" checked={draft.paymentRequired} onChange={(e) => setDraft((d) => ({ ...d, paymentRequired: e.target.checked }))}/></label>
                <div className="kiosk-device-current"><span>Configured connector</span><strong>{selected.payment_connector_name || "None"}</strong><small>{selected.payment_connector_package_key || ""} {selected.payment_connector_status || ""}{selected.payment_connector_error ? ` · ${selected.payment_connector_error}` : ""}</small></div>
              </div>

              <div className="kiosk-device-section">
                <h3><Printer size={18}/> Receipt printer</h3>
                <label><span>Assigned One Connect printer</span>
                  <select value={draft.printerConnectorId} onChange={(e) => setDraft((d) => ({ ...d, printerConnectorId: e.target.value }))}>
                    <option value="">Use local/browser printer fallback</option>
                    {printerConnectors.map((connector) => (
                      <option key={connector.id} value={connector.id}>
                        {connector.name} · {connector.connector_package_key}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.printerConnectorId ? (
                  <div className="kiosk-device-current"><span>Connector printer</span><strong>{printerConnectors.find((connector) => connector.id === draft.printerConnectorId)?.name || selected.printer_connector_name || "Assigned printer"}</strong><small>{selected.printer_connector_status || "Status updates from One Connect"}</small></div>
                ) : null}
                <div className="kiosk-device-two">
                  <label><span>Printer name</span><input value={draft.printerName} onChange={(e) => setDraft((d) => ({ ...d, printerName: e.target.value }))} placeholder="Kiosk receipt printer"/></label>
                  <label><span>Connection</span><select value={draft.printerConnectionType} onChange={(e) => setDraft((d) => ({ ...d, printerConnectionType: e.target.value }))}><option>NETWORK</option><option>USB</option><option>BLUETOOTH</option></select></label>
                </div>
                <label><span>Address / identifier</span><input value={draft.printerConnectionAddress} onChange={(e) => setDraft((d) => ({ ...d, printerConnectionAddress: e.target.value }))} placeholder="192.168.1.50:9100 or device identifier"/></label>
                <div className="kiosk-device-two">
                  <label><span>Paper width</span><select value={draft.printerPaperWidth} onChange={(e) => setDraft((d) => ({ ...d, printerPaperWidth: e.target.value }))}><option>80mm</option><option>58mm</option></select></label>
                  <label className="kiosk-device-toggle compact"><span><strong>Printer required</strong><small>Show degraded if printer is unavailable.</small></span><input type="checkbox" checked={draft.printerRequired} onChange={(e) => setDraft((d) => ({ ...d, printerRequired: e.target.checked }))}/></label>
                </div>
              </div>

              <div className="kiosk-device-actions">
                <button type="button" className="primary" onClick={save} disabled={saving}><Save size={17}/>{saving ? "Saving…" : "Save device settings"}</button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
