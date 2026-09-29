import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";

const emptyReport = { label: "", description: "", config: { fields: [], filters: [], sort: [], groupBy: "", metrics: [{ type: "count" }] } };
const inputClass = "w-full rounded border border-slate-300 px-3 py-2 text-sm";
const fieldName = (field) => field.api_name || field.apiName;
const fieldLabel = (field) => field.label || fieldName(field);

export default function ObjectReportsAdmin({ object, onMessage, onError }) {
  const [fields, setFields] = useState([]);
  const [reports, setReports] = useState([]);
  const [form, setForm] = useState(emptyReport);
  const [running, setRunning] = useState(null);

  const objectId = object?.id || object?.object_id;
  const objectKey = object?.object_key || object?.key || object?.api_name || "";

  const load = async () => {
    if (!objectId || !objectKey) return;
    try {
      const [metadata, reportResponse] = await Promise.all([
        apiRequest(`/api/platform/objects/${encodeURIComponent(objectId)}`),
        apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/reports?includeInactive=true`),
      ]);
      setFields((metadata?.data?.fields || []).filter((field) => field.active !== false && field.readable !== false));
      setReports(Array.isArray(reportResponse?.data) ? reportResponse.data : []);
    } catch (error) {
      onError?.(error?.message || "Unable to load object reports.");
    }
  };

  useEffect(() => {
    setForm(emptyReport);
    setRunning(null);
    void load();
  }, [objectId, objectKey]);

  const updateConfig = (patch) => setForm((current) => ({ ...current, config: { ...current.config, ...patch } }));
  const editReport = (report) => setForm({ ...report, config: { ...emptyReport.config, ...(report.config || {}) } });

  const save = async () => {
    if (!form.label.trim()) return onError?.("Enter a report name.");
    try {
      const payload = { label: form.label, description: form.description, config: form.config };
      if (form.id) {
        await apiRequest(`/api/platform/reports/${form.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/reports`, { method: "POST", body: JSON.stringify(payload) });
      }
      onMessage?.("Platform report saved.");
      setForm(emptyReport);
      await load();
    } catch (error) {
      onError?.(error?.message || "Unable to save report.");
    }
  };

  const run = async (report) => {
    try {
      const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(objectKey)}/reports/${encodeURIComponent(report.report_key)}`);
      setRunning(response?.data || null);
    } catch (error) {
      onError?.(error?.message || "Unable to run report.");
    }
  };

  const toggleActive = async (report) => {
    try {
      if (report.active === false) {
        await apiRequest(`/api/platform/reports/${report.id}`, { method: "PUT", body: JSON.stringify({ active: true }) });
        onMessage?.("Platform report activated.");
      } else {
        await apiRequest(`/api/platform/reports/${report.id}`, { method: "DELETE" });
        onMessage?.("Platform report deactivated.");
      }
      await load();
    } catch (error) {
      onError?.(error?.message || "Unable to update report.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="onepos-card onepos-card-body">
        <div className="flex items-center justify-between gap-3">
          <div>
            <strong>{object?.label || object?.name || objectKey} reports</strong>
            <p className="text-sm text-slate-500">Object-scoped metadata reports.</p>
          </div>
          <button type="button" className="objects-config-add" onClick={() => setForm(emptyReport)}>+ Report</button>
        </div>
        {reports.map((report) => (
          <div key={report.id} className="flex items-center justify-between gap-3 border-b py-3 text-sm">
            <span><b>{report.label}</b><span className="block text-slate-500">{report.description || "No description"}{report.active === false ? " · inactive" : ""}</span></span>
            <span className="flex gap-2">
              {report.active !== false ? <button type="button" onClick={() => run(report)} className="text-blue-700">Run</button> : null}
              <button type="button" onClick={() => editReport(report)} className="text-slate-700">Edit</button>
              <button type="button" onClick={() => toggleActive(report)} className="text-red-700">{report.active === false ? "Activate" : "Deactivate"}</button>
            </span>
          </div>
        ))}
        {!reports.length ? <div className="onepos-empty">No object reports configured.</div> : null}
      </div>

      <div className="onepos-card onepos-card-body space-y-4">
        <h3 className="font-semibold">{form.id ? "Edit report" : "Create report"}</h3>
        <input className={inputClass} placeholder="Report name" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} />
        <textarea className={inputClass} placeholder="Description" value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <div>
          <p className="text-sm font-medium mb-2">Permitted fields</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {fields.map((field) => <label key={fieldName(field)} className="text-sm flex gap-2"><input type="checkbox" checked={form.config.fields.includes(fieldName(field))} onChange={(event) => updateConfig({ fields: event.target.checked ? [...form.config.fields, fieldName(field)] : form.config.fields.filter((name) => name !== fieldName(field)) })} />{fieldLabel(field)}</label>)}
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm">Group by<select className={inputClass} value={form.config.groupBy || ""} onChange={(event) => updateConfig({ groupBy: event.target.value || null })}><option value="">No grouping</option>{fields.map((field) => <option key={fieldName(field)} value={fieldName(field)}>{fieldLabel(field)}</option>)}</select></label>
          <label className="text-sm">Sort field<select className={inputClass} value={form.config.sort[0]?.field || ""} onChange={(event) => updateConfig({ sort: event.target.value ? [{ field: event.target.value, direction: form.config.sort[0]?.direction || "asc" }] : [] })}><option value="">No sort</option>{fields.map((field) => <option key={fieldName(field)} value={fieldName(field)}>{fieldLabel(field)}</option>)}</select></label>
          <label className="text-sm">Direction<select className={inputClass} value={form.config.sort[0]?.direction || "asc"} onChange={(event) => updateConfig({ sort: form.config.sort[0]?.field ? [{ ...form.config.sort[0], direction: event.target.value }] : [] })}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm">Filter field<select className={inputClass} value={form.config.filters[0]?.field || ""} onChange={(event) => updateConfig({ filters: event.target.value ? [{ field: event.target.value, operator: form.config.filters[0]?.operator || "eq", value: form.config.filters[0]?.value || "" }] : [] })}><option value="">No filter</option>{fields.map((field) => <option key={fieldName(field)} value={fieldName(field)}>{fieldLabel(field)}</option>)}</select></label>
          <label className="text-sm">Filter operator<select className={inputClass} value={form.config.filters[0]?.operator || "eq"} onChange={(event) => updateConfig({ filters: form.config.filters[0]?.field ? [{ ...form.config.filters[0], operator: event.target.value }] : [] })}><option value="eq">Equals</option><option value="neq">Not equal</option><option value="contains">Contains</option><option value="gt">Greater than</option><option value="gte">At least</option><option value="lt">Less than</option><option value="lte">At most</option><option value="is_null">Is empty</option></select></label>
          <label className="text-sm">Filter value<input className={inputClass} value={form.config.filters[0]?.value || ""} onChange={(event) => updateConfig({ filters: form.config.filters[0]?.field ? [{ ...form.config.filters[0], value: event.target.value }] : [] })} /></label>
        </div>
        <label className="text-sm block max-w-xs">Aggregate<select className={inputClass} value={form.config.metrics[0]?.type || "count"} onChange={(event) => updateConfig({ metrics: [{ type: event.target.value, field: form.config.metrics[0]?.field || form.config.groupBy || null }] })}><option value="count">Count</option><option value="sum">Sum</option><option value="avg">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label>
        <div className="flex gap-2">
          <button type="button" onClick={save} className="onepos-btn onepos-btn-primary">Save report</button>
          {form.id ? <button type="button" onClick={() => setForm(emptyReport)} className="onepos-btn onepos-btn-secondary">Cancel</button> : null}
        </div>
      </div>

      {running ? (
        <div className="onepos-card onepos-card-body overflow-x-auto">
          <h3 className="font-semibold mb-3">Preview: {running.report?.label || "Report"}</h3>
          <table className="onepos-table">
            <thead><tr>{Object.keys(running.rows?.[0] || {}).map((key) => <th key={key}>{key}</th>)}</tr></thead>
            <tbody>{(running.rows || []).map((row, index) => <tr key={index}>{Object.values(row).map((value, cell) => <td key={cell}>{String(value ?? "—")}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
