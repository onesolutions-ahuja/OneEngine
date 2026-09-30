import { useEffect, useState } from "react";
import { Check, PlugZap, RefreshCw } from "lucide-react";
import { apiRequest } from "../../services/api.js";

const inputClass = "h-9 w-full border border-slate-300 rounded px-2 text-sm";

export default function ConnectorInstancesPanel({ packageKey: requestedPackageKey = "", settingsMode = false }) {
  const [apps, setApps] = useState([]);
  const [instances, setInstances] = useState([]);
  const [stores, setStores] = useState([]);
  const [packageKey, setPackageKey] = useState(() => requestedPackageKey);
  const [storeId, setStoreId] = useState("");
  const [tillId, setTillId] = useState("");
  const [fallbackOrder, setFallbackOrder] = useState("0");
  const [configuration, setConfiguration] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selectedApp = apps.find((app) => app.package_key === packageKey);
  const schema = selectedApp?.manifest?.connectorApp?.configurationSchema || [];
  const selectedStore = stores.find((store) => store.id === storeId);
  const tills = Array.isArray(selectedStore?.tills) ? selectedStore.tills : [];

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [catalogue, installed, storeResult] = await Promise.all([
        apiRequest("/api/packages/marketplace"),
        apiRequest("/api/connector-instances"),
        apiRequest("/api/admin/stores"),
      ]);
      const allApps = Array.isArray(catalogue?.data) ? catalogue.data : [];
      const installedApps = allApps.filter((app) =>
        app.company_installation?.status === "active" && app.manifest?.connectorApp
          && (!requestedPackageKey || app.package_key === requestedPackageKey)
      );
      setApps(installedApps);
      setInstances((Array.isArray(installed?.data) ? installed.data : []).filter((instance) => !requestedPackageKey || instance.packageKey === requestedPackageKey));
      setStores(Array.isArray(storeResult?.data) ? storeResult.data : []);
      if (!installedApps.some((app) => app.package_key === packageKey)) {
        setPackageKey(installedApps[0]?.package_key || "");
      }
    } catch (loadError) {
      setError(loadError.message || "Unable to load connector configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const defaults = Object.fromEntries(schema
      .filter((field) => Object.hasOwn(field, "default"))
      .map((field) => [field.key, field.default]));
    setConfiguration(defaults);
  }, [packageKey]);

  const createInstance = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/connector-instances", {
        method: "POST",
        body: JSON.stringify({ packageKey, storeId, tillId, fallbackOrder: Number(fallbackOrder), configuration }),
      });
      setMessage("Connector instance assigned. Test it before enabling.");
      await load();
    } catch (saveError) {
      setError(saveError.message || "Unable to assign connector");
    } finally {
      setSaving(false);
    }
  };

  const testInstance = async (instance) => {
    setWorkingId(instance.id);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest(`/api/connector-instances/${instance.id}/test`, { method: "POST" });
      const test = result?.data || {};
      if (test.success) setMessage(test.testMode ? "TEST connector passed its configuration check." : "Connector configuration check passed.");
      else setError(test.message || test.code || "Connector test failed");
      await load();
    } catch (testError) {
      setError(testError.message || "Unable to test connector");
    } finally {
      setWorkingId("");
    }
  };

  const toggleInstance = async (instance) => {
    setWorkingId(instance.id);
    setError("");
    setMessage("");
    try {
      await apiRequest(`/api/connector-instances/${instance.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !instance.enabled }),
      });
      setMessage(`Connector ${instance.enabled ? "disabled" : "enabled"}.`);
      await load();
    } catch (toggleError) {
      setError(toggleError.message || "Unable to update connector");
    } finally {
      setWorkingId("");
    }
  };

  return (
    <section className="mb-6 border border-slate-200 rounded-lg bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{settingsMode && selectedApp ? `${selectedApp.name} Settings` : "Hardware & Payment Connectors"}</h2>
          <p className="text-xs text-slate-500">{settingsMode ? "Configure credentials, store/till assignment and connection health." : "Installed connector apps and till assignments"}</p>
        </div>
        <button type="button" onClick={load} disabled={loading} title="Refresh connectors" className="h-9 w-9 grid place-items-center border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error && <p role="alert" className="mx-4 mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mx-4 mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}

      {loading ? <p className="px-4 py-5 text-sm text-slate-500">Loading connector apps…</p> : (
        <>
          {instances.length > 0 && (
            <div className="overflow-x-auto border-b border-slate-200">
              <table className="w-full text-sm">
                <thead><tr className="bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-4 py-2">Connector</th><th className="px-4 py-2">Store / till</th><th className="px-4 py-2">Order</th><th className="px-4 py-2">Health</th><th className="px-4 py-2 text-right">Actions</th>
                </tr></thead>
                <tbody>{instances.map((instance) => (
                  <tr key={instance.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{instance.name}</div>
                      <div className="text-xs text-slate-500">{instance.packageKey}{instance.health?.testMode ? " · TEST ONLY" : ""}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">{instance.storeName || "No store"} / {instance.tillName || "No till"}</td>
                    <td className="px-4 py-2.5">{instance.fallbackOrder === 0 ? "Primary" : `Backup ${instance.fallbackOrder}`}</td>
                    <td className="px-4 py-2.5">
                      <span className={instance.status === "CONNECTED" && instance.health?.success ? "text-emerald-700" : "text-amber-700"}>
                        {instance.enabled ? instance.status : "DISABLED"}
                      </span>
                      {instance.health?.message && <div className="max-w-48 truncate text-xs text-slate-500">{instance.health.message}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => testInstance(instance)} disabled={workingId === instance.id} title="Test connection" className="h-8 w-8 grid place-items-center border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"><PlugZap size={14} /></button>
                        <button type="button" onClick={() => toggleInstance(instance)} disabled={workingId === instance.id || (!instance.enabled && instance.health?.success !== true)} className="h-8 px-2 border border-slate-300 rounded text-xs hover:bg-slate-50 disabled:opacity-50">{instance.enabled ? "Disable" : "Enable"}</button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {apps.length ? (
            <form onSubmit={createInstance} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
              {!requestedPackageKey ? <label className="text-xs font-medium text-slate-600">Installed app
                <select required value={packageKey} onChange={(event) => setPackageKey(event.target.value)} className={`${inputClass} mt-1`}>
                  {apps.map((app) => <option key={app.package_key} value={app.package_key}>{app.name}</option>)}
                </select>
              </label> : null}
              <label className="text-xs font-medium text-slate-600">Store
                <select required value={storeId} onChange={(event) => { setStoreId(event.target.value); setTillId(""); }} className={`${inputClass} mt-1`}>
                  <option value="">Select store</option>
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">Till / terminal
                <select required value={tillId} onChange={(event) => setTillId(event.target.value)} className={`${inputClass} mt-1`}>
                  <option value="">Select till</option>
                  {tills.map((till) => <option key={till.id} value={till.id}>{till.name || till.terminalNumber}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">Fallback order
                <select value={fallbackOrder} onChange={(event) => setFallbackOrder(event.target.value)} className={`${inputClass} mt-1`}>
                  <option value="0">Primary</option><option value="1">Backup 1</option><option value="2">Backup 2</option>
                </select>
              </label>
              <div className="flex items-end"><button type="submit" disabled={saving || !packageKey || !storeId || !tillId} className="h-9 px-3 inline-flex items-center gap-2 rounded bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 disabled:opacity-50"><Check size={15} />{saving ? "Assigning…" : "Assign connector"}</button></div>
              {schema.map((field) => (
                <label key={field.key} className="text-xs font-medium text-slate-600">{field.label || field.key}
                  {field.enum ? (
                    <select value={configuration[field.key] ?? field.default ?? ""} onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: event.target.value }))} className={`${inputClass} mt-1`}>
                      {field.enum.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  ) : (
                    <input type={field.type === "number" ? "number" : "text"} value={configuration[field.key] ?? field.default ?? ""} onChange={(event) => setConfiguration((current) => ({ ...current, [field.key]: field.type === "number" ? Number(event.target.value) : event.target.value }))} className={`${inputClass} mt-1`} />
                  )}
                </label>
              ))}
            </form>
          ) : (
            <div className="px-4 py-5 text-sm text-slate-600">No connector apps are installed. <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => window.dispatchEvent(new CustomEvent("onepos:open-store"))}>Open oneStore</button> to install an app.</div>
          )}
        </>
      )}
    </section>
  );
}