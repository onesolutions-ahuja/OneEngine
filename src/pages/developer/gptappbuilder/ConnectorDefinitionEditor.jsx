import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiRequest } from "../../../services/api.js";

const AUTH_TYPES = [
  { key: "none", label: "None" },
  { key: "api_key", label: "API Key" },
  { key: "bearer", label: "Bearer" },
  { key: "basic", label: "Basic" },
];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const blankOperation = () => ({ key: "", name: "", method: "GET", path: "/" });
const blankCredential = () => ({ key: "", label: "", type: "string", required: true });

function safeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function ConnectorDefinitionEditor({ value = "", onChange, onMessage, onError }) {
  const [connectors, setConnectors] = useState([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    connectorKey: "", name: "", description: "", authType: "none", baseUrl: "",
    credentialsSchema: [], operations: [blankOperation()], timeoutMs: 15000,
    retryPolicy: { maxAttempts: 3, backoffMs: 1000 }, status: "ACTIVE",
  });

  const load = async () => {
    const response = await apiRequest("/api/connectors");
    setConnectors(Array.isArray(response?.data) ? response.data : []);
  };
  useEffect(() => { void load().catch(() => setConnectors([])); }, []);

  const selected = useMemo(() => connectors.find((item) => item.connectorKey === value) || null, [connectors, value]);

  const patchOperation = (index, patch) => setDraft((current) => ({ ...current, operations: current.operations.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  const patchCredential = (index, patch) => setDraft((current) => ({ ...current, credentialsSchema: current.credentialsSchema.map((item, i) => i === index ? { ...item, ...patch } : item) }));

  const save = async () => {
    const connectorKey = safeKey(draft.connectorKey || draft.name);
    if (!connectorKey || !draft.name.trim() || !draft.baseUrl.trim()) return onError?.("Connector key, name and base URL are required.");
    const operations = draft.operations.filter((item) => item.key && item.path).map((item) => ({ ...item, key: safeKey(item.key) }));
    if (!operations.length) return onError?.("At least one HTTP operation is required.");
    setBusy(true);
    try {
      const response = await apiRequest("/api/platform/connectors", {
        method: "POST",
        body: JSON.stringify({ ...draft, connectorKey, operations }),
      });
      const connector = response?.data;
      await load();
      onChange?.(connector?.connectorKey || connectorKey);
      setEditing(false);
      onMessage?.("Connector metadata saved. Tenant credentials remain encrypted and separate.");
    } catch (error) {
      onError?.(error?.message || "Unable to save connector metadata.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-medium text-slate-500">Connector / HTTP provider</label>
      <div className="flex gap-2">
        <select className="onepos-input flex-1" value={value || ""} onChange={(event) => onChange?.(event.target.value || "")}>
          <option value="">No connector</option>
          {connectors.map((item) => <option key={item.connectorKey} value={item.connectorKey}>{item.name || item.connectorKey}</option>)}
        </select>
        <button type="button" className="onepos-btn" onClick={() => setEditing((current) => !current)}><Plus size={14}/>New</button>
      </div>
      {selected ? <p className="text-[11px] text-slate-400">{selected.authType} · {selected.operations?.length || 0} operation(s) · credentials configured by each tenant from schema.</p> : null}
      {editing ? (
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <label>Name<input className="onepos-input" value={draft.name} onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value, connectorKey: v.connectorKey || safeKey(e.target.value) }))}/></label>
          <label>Metadata key<input className="onepos-input" value={draft.connectorKey} onChange={(e) => setDraft((v) => ({ ...v, connectorKey: safeKey(e.target.value) }))}/></label>
          <label>Base URL<input className="onepos-input" value={draft.baseUrl} onChange={(e) => setDraft((v) => ({ ...v, baseUrl: e.target.value }))} placeholder="https://api.example.com"/></label>
          <label>Authentication<select className="onepos-input" value={draft.authType} onChange={(e) => setDraft((v) => ({ ...v, authType: e.target.value }))}>{AUTH_TYPES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          <div><div className="flex items-center justify-between"><strong className="text-xs">Tenant credential fields</strong><button type="button" className="onepos-btn" onClick={() => setDraft((v) => ({ ...v, credentialsSchema: [...v.credentialsSchema, blankCredential()] }))}><Plus size={13}/>Field</button></div>
            {draft.credentialsSchema.map((field, index) => <div key={index} className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2"><input className="onepos-input" placeholder="key" value={field.key} onChange={(e) => patchCredential(index,{key:safeKey(e.target.value)})}/><input className="onepos-input" placeholder="label" value={field.label} onChange={(e) => patchCredential(index,{label:e.target.value})}/><button type="button" className="onepos-btn" onClick={() => setDraft((v)=>({...v,credentialsSchema:v.credentialsSchema.filter((_,i)=>i!==index)}))}><Trash2 size={13}/></button></div>)}
          </div>
          <div><div className="flex items-center justify-between"><strong className="text-xs">HTTP operations</strong><button type="button" className="onepos-btn" onClick={() => setDraft((v) => ({ ...v, operations: [...v.operations, blankOperation()] }))}><Plus size={13}/>Operation</button></div>
            {draft.operations.map((operation,index)=><div key={index} className="mt-2 grid grid-cols-[1fr_100px_1fr_auto] gap-2"><input className="onepos-input" placeholder="operation_key" value={operation.key} onChange={(e)=>patchOperation(index,{key:safeKey(e.target.value),name:operation.name||e.target.value})}/><select className="onepos-input" value={operation.method} onChange={(e)=>patchOperation(index,{method:e.target.value})}>{METHODS.map((method)=><option key={method}>{method}</option>)}</select><input className="onepos-input" placeholder="/relative/path" value={operation.path} onChange={(e)=>patchOperation(index,{path:e.target.value})}/><button type="button" className="onepos-btn" onClick={()=>setDraft((v)=>({...v,operations:v.operations.filter((_,i)=>i!==index)}))}><Trash2 size={13}/></button></div>)}
          </div>
          <button type="button" className="onepos-btn onepos-btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save Connector Metadata"}</button>
          <p className="text-[11px] text-slate-400">No credential values are stored here. The generated tenant configuration uses the connector credential schema and encrypted credential store.</p>
        </div>
      ) : null}
    </div>
  );
}
