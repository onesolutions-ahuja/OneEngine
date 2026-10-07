import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api.js";
import { platformFieldChoices } from "./platformDashboard.js";
import { ConditionalFormattingEditor, DrillActionEditor } from "../../pages/reports/ReportAdvancedEditors.jsx";\nimport { useComponentRegistry, componentByKey } from "../../pages/settings/Platform/componentRegistry.js";

const FIELD = "w-full border rounded-lg px-2 py-1.5 text-sm";
const STYLE = { borderColor: "var(--onepos-border)", background: "var(--onepos-surface-raised)", color: "var(--onepos-text-primary)" };
const LABEL = "block text-xs font-semibold mb-1";

function useReports() {
  const [state, setState] = useState({ reports: [], loading: true });
  useEffect(() => {
    let live = true;
    apiRequest("/api/reports/custom")
      .then((response) => {
        if (!live) return;
        setState({ reports: response?.success ? response.data || [] : [], loading: false });
      })
      .catch(() => { if (live) setState({ reports: [], loading: false }); });
    return () => { live = false; };
  }, []);
  return state;
}
function useFields(objectId) {
  const [state, setState] = useState({ fields: [], loading: false, error: "" });
  useEffect(() => {
    if (!objectId) { setState({ fields: [], loading: false, error: "" }); return undefined; }
    let alive = true;
    setState({ fields: [], loading: true, error: "" });
    apiRequest(`/api/reports/custom/platform-objects/${encodeURIComponent(objectId)}/metadata`).then((response) => {
      if (!alive) return;
      const direct=response.data?.fields||[];const related=(response.data?.relationships||[]).flatMap((relationship)=>(relationship.fields||[]));setState(response.success ? { fields: [...direct,...related], loading: false, error: "" } : { fields: [], loading: false, error: response.message || "Unable to load Object fields" });
    }).catch((error) => alive && setState({ fields: [], loading: false, error: error.message }));
    return () => { alive = false; };
  }, [objectId]);
  return state;
}

export default function DashboardComponentProperties({ component, onChange }) {
  const { reports: drillReports } = useReports();
  const config = component.config || {};
  const registry = useComponentRegistry();
  const spec = componentByKey(registry, component.registryKey || component.type);
  const metadataConfigurable = Array.isArray(spec?.configurable) ? spec.configurable : [];
  const isMetadataConfigured = Boolean(spec && spec.runtimeKind !== "analytics" && !["text","image","clock_widget","calendar_widget","weather_widget"].includes(component.type));
  const savedReport = drillReports.find((item) => String(item.id) === String(config.reportId || ""));
  const report = savedReport?.definition || config.report || {};
  const isPlatform = true;
  const isChart = ["pie","donut","bar","line","gauge","funnel","scatter","combo","chart"].includes(component.type);
  const isUtility = ["clock_widget", "calendar_widget", "weather_widget"].includes(component.type);
  const isImage = component.type === "image";
  const { fields, loading, error: fieldsError } = useFields(report.objectId || null);
  const reportFieldKeys = new Set([...(report.fields || []), ...(report.rowGroups || report.groupBy || []), ...(report.columnGroups || [])].map(String));
  const reportFields = fields.filter((field) => reportFieldKeys.has(String(field.key || field.api_name)));
  const choices = platformFieldChoices(reportFields);
  const summaryFields = (report.summaries || []).map((summary) => ({
    key: summary.alias || `${String(summary.aggregate || "count").toLowerCase()}_${summary.field}`,
    label: summary.alias || `${summary.aggregate || "COUNT"} ${choices.all.find((field) => field.key === summary.field)?.label || summary.field}`,
    type: "number",
  }));
  const metrics = [...summaryFields, ...choices.metricFields];
  const groups = choices.groupFields;
  const setConfig = (patch) => onChange({ ...component, config: { ...config, ...patch } });
  const selectSavedReport = (reportId) => { onChange({ ...component, config: { ...config, reportId: reportId || null, report: null, valueField: null, labelField: null, seriesField: null, yFields: [], secondaryAxisFields: [], aggregate: null } }); };
  const num = (patch) => (event) => setConfig({ [patch]: Number(event.target.value) });
  const layout = (patch) => (event) => onChange({ ...component, layout: { ...component.layout, [patch]: Number(event.target.value) } });
  const selectGroup = (value) => setConfig({ labelField: value || null });
  const selectMetric = (value) => setConfig({ valueField: value || null, aggregate: null });
  const selectComboMetrics = (values) => {
    const yFields = [...new Set(values)].slice(0,4);
    setConfig({ valueField: yFields[0] || null, yFields, secondaryAxisFields: (config.secondaryAxisFields || []).filter((field) => yFields.includes(field)), aggregate: null });
  };
  return <div className="mt-3 grid gap-3 md:grid-cols-2">
    <div className="md:col-span-2"><span className={LABEL}>Title</span><input className={FIELD} style={STYLE} value={component.title || ""} onChange={(event) => onChange({ ...component, title: event.target.value })} /></div>
    {isMetadataConfigured ? <>
      {metadataConfigurable.map((key) => {
        const value = config[key];
        if (typeof value === "boolean") return <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value} onChange={(event) => setConfig({ [key]: event.target.checked })}/>{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</label>;
        if (value && typeof value === "object") return <div key={key} className="md:col-span-2"><span className={LABEL}>{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</span><textarea className={FIELD} rows={2} style={STYLE} value={JSON.stringify(value)} onChange={(event) => { try { setConfig({ [key]: JSON.parse(event.target.value) }); } catch { /* keep last valid metadata value */ } }} /></div>;
        return <div key={key}><span className={LABEL}>{key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</span><input className={FIELD} style={STYLE} value={value ?? ""} onChange={(event) => setConfig({ [key]: event.target.value })} /></div>;
      })}
      <div><span className={LABEL}>Width (grid columns, 1–12)</span><input type="number" min={1} max={12} className={FIELD} style={STYLE} value={component.layout?.w ?? 6} onChange={layout("w")} /></div>
      <div><span className={LABEL}>Height</span><input type="number" min={1} max={12} className={FIELD} style={STYLE} value={component.layout?.h ?? 4} onChange={layout("h")} /></div>
    </> : component.type === "text" ? <div className="md:col-span-2"><span className={LABEL}>Content</span><textarea className={FIELD} rows={3} style={STYLE} value={config.content || ""} onChange={(event) => setConfig({ content: event.target.value })} /></div> : isImage ? <>
      <div className="md:col-span-2"><span className={LABEL}>Image URL</span><input className={FIELD} style={STYLE} value={config.imageUrl || ""} placeholder="https://…" onChange={(event) => setConfig({ imageUrl: event.target.value })} /></div>
      <div><span className={LABEL}>Alternative text</span><input className={FIELD} style={STYLE} value={config.altText || ""} onChange={(event) => setConfig({ altText: event.target.value })} /></div>
      <div><span className={LABEL}>Image fit</span><select className={FIELD} style={STYLE} value={config.imageFit || "contain"} onChange={(event) => setConfig({ imageFit: event.target.value })}><option value="contain">Contain</option><option value="cover">Cover</option></select></div>
      <div className="md:col-span-2"><span className={LABEL}>Click-through URL (optional)</span><input className={FIELD} style={STYLE} value={config.linkUrl || ""} placeholder="https://… or /app/path" onChange={(event) => setConfig({ linkUrl: event.target.value })} /></div>
      <div><span className={LABEL}>Width (grid columns, 1–12)</span><input type="number" min={1} max={12} className={FIELD} style={STYLE} value={component.layout?.w ?? 6} onChange={layout("w")} /></div>
      <div><span className={LABEL}>Height</span><input type="number" min={1} max={12} className={FIELD} style={STYLE} value={component.layout?.h ?? 4} onChange={layout("h")} /></div>
    </> : isUtility ? <>
      <div><span className={LABEL}>Time zone</span><input className={FIELD} style={STYLE} value={config.timeZone || ""} placeholder="Browser default" onChange={(event) => setConfig({ timeZone: event.target.value })} /></div>
      {component.type === "clock_widget" ? <>
        <div><span className={LABEL}>Clock format</span><select className={FIELD} style={STYLE} value={config.hour12 === false ? "24" : "12"} onChange={(event) => setConfig({ hour12: event.target.value === "12" })}><option value="24">24 hour</option><option value="12">12 hour</option></select></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.showSeconds === true} onChange={(event) => setConfig({ showSeconds: event.target.checked })}/> Show seconds</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.showDate !== false} onChange={(event) => setConfig({ showDate: event.target.checked })}/> Show date</label>
      </> : null}
      {component.type === "calendar_widget" ? <>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.showWeekday !== false} onChange={(event) => setConfig({ showWeekday: event.target.checked })}/> Show weekday</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.showMonth !== false} onChange={(event) => setConfig({ showMonth: event.target.checked })}/> Show month</label>
      </> : null}
      {component.type === "weather_widget" ? <>
        <div><span className={LABEL}>Location</span><input className={FIELD} style={STYLE} value={config.location || ""} placeholder="e.g. London" onChange={(event) => setConfig({ location: event.target.value })} /></div>
        <div><span className={LABEL}>Unit</span><select className={FIELD} style={STYLE} value={config.unit || "C"} onChange={(event) => setConfig({ unit: event.target.value })}><option value="C">°C</option><option value="F">°F</option></select></div>
        <div><span className={LABEL}>Temperature</span><input className={FIELD} style={STYLE} value={config.temperature || ""} placeholder="Optional display value" onChange={(event) => setConfig({ temperature: event.target.value })} /></div>
        <div><span className={LABEL}>Condition</span><input className={FIELD} style={STYLE} value={config.condition || ""} placeholder="Optional condition" onChange={(event) => setConfig({ condition: event.target.value })} /></div>
      </> : null}
      <div><span className={LABEL}>Width (grid columns, 1–12)</span><input type="number" min={1} max={12} className={FIELD} style={STYLE} value={component.layout?.w ?? 3} onChange={layout("w")} /></div>
      <div><span className={LABEL}>Height</span><input type="number" min={1} max={12} className={FIELD} style={STYLE} value={component.layout?.h ?? 2} onChange={layout("h")} /></div>
    </> : <>
      <div className="md:col-span-2"><span className={LABEL}>Source report</span><select className={FIELD} style={STYLE} value={config.reportId || ""} onChange={(event) => selectSavedReport(event.target.value)}><option value="">{drillReports.length ? "Select a saved report" : "No saved reports available"}</option>{drillReports.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><p className="mt-1 text-xs" style={{ color: "var(--onepos-text-muted)" }}>Dashboard analytics widgets use saved Report Builder definitions. Edit objects, fields, relationships and filters in the source report.</p>{fieldsError ? <p className="text-xs" style={{ color: "#b91c1c" }}>{fieldsError}</p> : null}</div>
      {component.type === "combo" ? <><div><span className={LABEL}>Metric fields (up to 4)</span><select multiple data-testid="metric-fields" className={FIELD} style={STYLE} value={config.yFields?.length ? config.yFields : (config.valueField ? [config.valueField] : [])} onChange={(event) => selectComboMetrics(Array.from(event.target.selectedOptions).map((option) => option.value))}>{metrics.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></div><div><span className={LABEL}>Secondary axis</span><select multiple className={FIELD} style={STYLE} value={config.secondaryAxisFields || []} onChange={(event) => setConfig({ secondaryAxisFields: Array.from(event.target.selectedOptions).map((option) => option.value).filter((field) => (config.yFields || []).includes(field)) })}>{(config.yFields || []).map((field) => <option key={field} value={field}>{metrics.find((item) => item.key === field)?.label || field}</option>)}</select></div></> : <div><span className={LABEL}>Metric field</span><select data-testid="metric-field" className={FIELD} style={STYLE} value={config.valueField || ""} onChange={(event) => selectMetric(event.target.value)}><option value="">Select a metric</option>{metrics.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select>{isPlatform && report.objectId && !loading && !metrics.length ? <p className="text-xs" style={{ color: "var(--onepos-text-muted)" }}>This Object has no aggregatable fields.</p> : null}</div>}
      <div><span className={LABEL}>{isChart ? "Category / group field" : "Label field (optional)"}</span><select className={FIELD} style={STYLE} value={config.labelField || ""} onChange={(event) => selectGroup(event.target.value)}><option value="">None</option>{groups.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></div>
      
      <div><span className={LABEL}>Format</span><select data-testid="format" className={FIELD} style={STYLE} value={config.format || "number"} onChange={(event) => setConfig({ format: event.target.value })}><option value="number">Number</option><option value="currency">Currency</option><option value="percent">Percentage</option></select></div>
      {component.type === "kpi" ? <div><span className={LABEL}>Size</span><select data-testid="size" className={FIELD} style={STYLE} value={config.size || "medium"} onChange={(event) => setConfig({ size: event.target.value })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div> : null}
      {isChart ? <><div><span className={LABEL}>Maximum categories</span><input type="number" min={2} max={25} data-testid="max-categories" className={FIELD} style={STYLE} value={config.maxCategories ?? 6} onChange={num("maxCategories")} /></div><div><span className={LABEL}>Limit</span><input type="number" min={1} max={200} className={FIELD} style={STYLE} value={config.limit ?? 12} onChange={num("limit")} /></div></> : null}
      <div><span className={LABEL}>Width (grid columns, 1–12)</span><input type="number" min={1} max={12} data-testid="width" className={FIELD} style={STYLE} value={component.layout?.w ?? 6} onChange={layout("w")} /></div>
      <div><span className={LABEL}>Height</span><input type="number" min={1} max={12} className={FIELD} style={STYLE} value={component.layout?.h ?? 4} onChange={layout("h")} /></div>
      {isChart ? <>
        {component.type === "bar" || component.type === "chart" ? <><div><span className={LABEL}>Orientation</span><select className={FIELD} style={STYLE} value={config.orientation || "vertical"} onChange={(event) => setConfig({ orientation: event.target.value })}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.stacked === true} onChange={(event) => setConfig({ stacked: event.target.checked })}/>Stack series</label></> : null}
        {component.type === "line" || (component.type === "chart" && config.chartType === "line") ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.showMarkers !== false} onChange={(event) => setConfig({ showMarkers: event.target.checked })}/>Show markers</label> : null}
        {component.type === "donut" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.showTotal !== false} onChange={(event) => setConfig({ showTotal: event.target.checked })}/>Show total</label> : null}
        {component.type === "gauge" ? <>
          <div><span className={LABEL}>Target mode</span><select className={FIELD} style={STYLE} value={config.targetMode || "fixed"} onChange={(event) => setConfig({ targetMode: event.target.value })}><option value="fixed">Fixed target</option><option value="field">Field target</option></select></div>
          {config.targetMode === "field" ? <div><span className={LABEL}>Target field</span><select className={FIELD} style={STYLE} value={config.targetField || ""} onChange={(event) => setConfig({ targetField: event.target.value })}><option value="">Select field</option>{metrics.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}</select></div> : <div><span className={LABEL}>Target value</span><input type="number" className={FIELD} style={STYLE} value={config.targetValue ?? 100} onChange={num("targetValue")} /></div>}
        </> : null}
      </> : null}
      <div className="md:col-span-2">
        <ConditionalFormattingEditor
          rules={config.conditionalFormatting || []}
          onChange={(conditionalFormatting) => setConfig({ conditionalFormatting })}
          fields={[
            ...choices.all,
            ...summaryFields,
          ]}
        />
      </div>
      <div className="md:col-span-2">
        <DrillActionEditor
          action={config.drillAction}
          onChange={(drillAction) => setConfig({ drillAction })}
          reports={drillReports}
          fields={choices.all}
        />
      </div>
    </>}
    <p className="md:col-span-2 text-xs" data-testid="value-column" style={{ color: "var(--onepos-text-muted)" }}>Value column: <code>{config.valueField || "not selected"}</code></p>
  </div>;
}
