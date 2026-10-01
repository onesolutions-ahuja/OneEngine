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
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [deviceResponse, terminalResponse] = await Promise.all([
        apiRequest("/api/kiosk/devices"),
        apiRequest("/api/payment-terminals").catch(() => ({ data: [] })),
      ]);
      if (!deviceResponse?.success) throw new Error(deviceResponse?.message || "Unable to load kiosk devices");
      const rows = Array.isArray(deviceResponse.data) ? deviceResponse.data : [];
      setDevices(rows);
      setTerminals(Array.isArray(terminalResponse?.data) ? terminalResponse.data : []);
      const nextId = selectedId && rows.some((row) => row.id === selectedId) ? selectedId : rows[0]?.id || "";
      setSelectedId(nextId);
      const selected = rows.find((row) => row.id === nextId);
      if (selected) setDraft({
        name: selected.name || "OneKiosk",
        active: selected.active !== false,
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
      active: device.active !== false,
      paymentTerminalId: device.payment_terminal_id || "",
      paymentRequired: device.payment_required !== false,
      printerRequired: device.printer_required === true,
      printerName: device.printer_name || "",
      printerConnectionType: device.printer_connection_type || "NETWORK",
      printerConnectionAddress: device.printer_connection_address || "",
      printerPaperWidth: device.printer_paper_width || "80mm",
    });
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
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={17}/> Refresh</button>
      </header>

      {error ? <div className="kiosk-devices-error">{error}</div> : null}

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
                <div><CreditCard size={20}/><span>Card terminal</span><StatusPill status={selected.payment_status} /></div>
                <div><Printer size={20}/><span>Receipt printer</span><StatusPill status={selected.printer_status} /></div>
              </div>

              <div className="kiosk-device-section">
                <h3>Device</h3>
                <label><span>Name</span><input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}/></label>
                <label className="kiosk-device-toggle"><span><strong>Active</strong><small>Disable this kiosk without deleting its configuration.</small></span><input type="checkbox" checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}/></label>
              </div>

              <div className="kiosk-device-section">
                <h3><CreditCard size={18}/> Card machine</h3>
                <label><span>Assigned terminal</span>
                  <select value={draft.paymentTerminalId} onChange={(e) => setDraft((d) => ({ ...d, paymentTerminalId: e.target.value }))}>
                    <option value="">No terminal assigned</option>
                    {terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.name} · {terminal.provider}</option>)}
                  </select>
                </label>
                <label className="kiosk-device-toggle"><span><strong>Payment required</strong><small>Mark the kiosk degraded if its card machine is unavailable.</small></span><input type="checkbox" checked={draft.paymentRequired} onChange={(e) => setDraft((d) => ({ ...d, paymentRequired: e.target.checked }))}/></label>
                <div className="kiosk-device-current"><span>Configured terminal</span><strong>{selected.payment_terminal_name || "None"}</strong><small>{selected.payment_provider || ""} {selected.payment_terminal_last_test || ""}</small></div>
              </div>

              <div className="kiosk-device-section">
                <h3><Printer size={18}/> Receipt printer</h3>
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
