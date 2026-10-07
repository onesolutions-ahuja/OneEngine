import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";

function rowsFromResponse(response) {
  const data = response?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.deployments)) return data.deployments;
  return [];
}

export default function DeploymentAdmin({ onMessage, onError }) {
  const [objectKeys, setObjectKeys] = useState("");
  const [manifestText, setManifestText] = useState("");
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  const reportError = (error) => {
    const message = error?.message || "Unable to load deployments";
    setLocalError(message);
    onError?.(message);
  };

  const loadHistory = async () => {
    try {
      setLocalError("");
      const result = await apiRequest("/api/platform/deployments");
      setHistory(rowsFromResponse(result));
    } catch (error) {
      setHistory([]);
      reportError(error);
    }
  };
  useEffect(() => { loadHistory(); }, []);

  const parseManifest = () => {
    try {
      const value = JSON.parse(manifestText);
      return value.manifest || value;
    } catch { throw new Error("Manifest must be valid JSON"); }
  };
  const exportMetadata = async () => {
    setBusy(true);
    try {
      const result = await apiRequest("/api/platform/metadata/export", { method: "POST", body: JSON.stringify({ objectKeys: objectKeys.split(",").map((key) => key.trim()).filter(Boolean) }) });
      setManifestText(JSON.stringify(result.data?.manifest || {}, null, 2));
      onMessage?.("Metadata package exported.");
    } catch (error) { onError?.(error.message); } finally { setBusy(false); }
  };
  const dryRun = async () => {
    setBusy(true);
    try { const result = await apiRequest("/api/platform/deployments/dry-run", { method: "POST", body: JSON.stringify({ manifest: parseManifest() }) }); setPlan(result.data); }
    catch (error) { reportError(error); } finally { setBusy(false); }
  };
  const deploy = async () => {
    setBusy(true);
    try { await apiRequest("/api/platform/deployments", { method: "POST", body: JSON.stringify({ manifest: parseManifest() }) }); onMessage?.("Metadata deployment completed."); setPlan(null); await loadHistory(); }
    catch (error) { reportError(error); } finally { setBusy(false); }
  };
  const rollback = async (id) => {
    setBusy(true);
    try { await apiRequest(`/api/platform/deployments/${id}/rollback`, { method: "POST" }); onMessage?.("Deployment rolled back."); await loadHistory(); }
    catch (error) { reportError(error); } finally { setBusy(false); }
  };

  const planOrder = Array.isArray(plan?.order) ? plan.order : [];
  const planConflicts = Array.isArray(plan?.conflicts) ? plan.conflicts : [];

  return <div className="space-y-4">
    {localError ? <div className="onebuilder-error" role="alert">{localError}</div> : null}
    <div className="platform-rule-header"><div><div className="platform-eyebrow">PLATFORM / DEPLOYMENTS</div><h2>Metadata Deployment</h2><p>Promote portable metadata between authorised companies without moving runtime records or secrets.</p></div></div>
    <section className="platform-editor-card space-y-3">
      <h3 className="font-semibold">Export Metadata</h3>
      <div className="flex gap-2"><input className="onepos-input flex-1" value={objectKeys} onChange={(event) => setObjectKeys(event.target.value)} placeholder="Object API keys, comma separated" /><button className="platform-primary-button" disabled={busy} onClick={exportMetadata}>Export</button></div>
    </section>
    <section className="platform-editor-card space-y-3">
      <h3 className="font-semibold">Import Package</h3>
      <textarea className="onepos-input min-h-56 font-mono text-xs" value={manifestText} onChange={(event) => setManifestText(event.target.value)} placeholder='{"objects":[...]}' />
      <div className="flex flex-wrap items-center gap-2"><button className="platform-secondary-button" disabled={busy || !manifestText} onClick={dryRun}>Dry Run</button><button className="platform-primary-button" disabled={busy || !manifestText || !plan?.valid} onClick={deploy}>Deploy</button>{manifestText && !plan ? <span className="text-xs text-slate-500">Run Dry Run first to validate the package before deployment.</span> : null}{plan && !plan.valid ? <span className="text-xs text-red-600">Resolve the Dry Run conflicts before Deploy becomes available.</span> : null}</div>
      {plan ? <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm"><strong>{plan.valid ? "Ready to deploy" : "Conflicts found"}</strong><div>Creates: {plan.creates?.length || 0} · Updates: {plan.updates?.length || 0} · Errors: {plan.errors?.length || 0}</div><div className="mt-1">Types: {planOrder.map((item) => item.type).filter((type, index, all) => all.indexOf(type) === index).join(", ") || "none"}</div>{planOrder.some((item) => item.reversible === false) ? <div className="mt-2 font-medium text-amber-700">NON_REVERSIBLE: package metadata changes are retained; installation state can be restored.</div> : null}{plan.conflicts?.length ? <ul className="mt-2 list-disc pl-5 text-red-700">{planConflicts.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div> : null}
    </section>
    <section className="platform-editor-card space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Deployment History</h3><button className="platform-secondary-button" onClick={loadHistory}>Refresh</button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Package</th><th className="p-2">Version</th><th className="p-2">Status</th><th className="p-2">When</th><th className="p-2" /></tr></thead><tbody>{history.map((item) => <tr className="border-b" key={item.id}><td className="p-2">{item.package_key}</td><td className="p-2">{item.package_version}</td><td className="p-2">{item.status}</td><td className="p-2">{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</td><td className="p-2 text-right">{item.status === "success" ? <button className="platform-secondary-button" disabled={busy} onClick={() => rollback(item.id)}>Rollback</button> : null}</td></tr>)}{!history.length ? <tr><td className="p-3 text-slate-500" colSpan="5">No deployments recorded.</td></tr> : null}</tbody></table></div></section>
  </div>;
}
