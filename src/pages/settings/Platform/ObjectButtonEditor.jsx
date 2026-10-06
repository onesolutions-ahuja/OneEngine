import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../../services/api.js";

const PLACEMENTS = [
  ["record", "Record"],
  ["detail", "Detail"],
  ["list", "List"],
  ["bulk", "Bulk / mass action"],
];

const EMPTY = {
  label: "",
  buttonKey: "",
  icon: "",
  variant: "primary",
  placement: "record",
  targetType: "action",
  targetKey: "",
  requiredPermission: "",
  active: true,
};

function safeKey(label = "") {
  return String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 140);
}

export default function ObjectButtonEditor({ object, button = null, onSaved, onCancel, onError }) {
  const [registry, setRegistry] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [variants, setVariants] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    ...EMPTY,
    label: button?.label || "",
    buttonKey: button?.button_key || "",
    icon: button?.icon || "",
    variant: button?.variant || "primary",
    placement: button?.placement || "record",
    targetType: button?.target_type || "action",
    targetKey: button?.target_key || button?.action_key || "",
    requiredPermission: button?.required_permission || "",
    active: button?.active !== false,
  }));

  useEffect(() => {
    Promise.all([
      apiRequest("/api/platform/action-registry"),
      apiRequest("/api/platform/rules"),
      apiRequest("/api/platform/button-variants"),
      apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/registered-actions`),
    ]).then(([core, rules, variantResponse, custom]) => {
      const customActions = (Array.isArray(custom?.data) ? custom.data : []).map((item) => ({
        key: item.action_key,
        displayName: item.label,
      }));
      const coreActions = Array.isArray(core?.data) ? core.data : [];
      setRegistry([...coreActions, ...customActions].filter((item, index, all) =>
        item?.key && all.findIndex((candidate) => candidate?.key === item.key) === index
      ));
      setWorkflows((Array.isArray(rules?.data) ? rules.data : []).filter((rule) =>
        rule?.active !== false && rule?.action?.type === "workflow"
      ));
      setVariants(Array.isArray(variantResponse?.data) ? variantResponse.data : []);
    }).catch((error) => onError?.(error?.message || "Unable to load button resources."));
  }, [object.id, onError]);

  const targets = useMemo(() => form.targetType === "workflow"
    ? workflows.map((rule) => ({ key: String(rule.id || rule.name), label: rule.name || rule.rule_key || rule.id }))
    : form.targetType === "action"
      ? registry.map((item) => ({ key: item.key, label: item.displayName || item.label || item.key }))
      : [],
  [form.targetType, registry, workflows]);

  async function save() {
    if (!form.label.trim()) return onError?.("Enter a button label.");
    const buttonKey = button?.id ? form.buttonKey : (form.buttonKey || safeKey(form.label));
    if (!buttonKey) return onError?.("Enter a button API key.");
    if (!form.targetKey) return onError?.("Choose what the button runs.");

    setSaving(true);
    onError?.("");
    try {
      const payload = {
        buttonKey,
        label: form.label.trim(),
        icon: form.icon.trim() || null,
        variant: form.variant,
        placement: form.placement,
        targetType: form.targetType,
        targetKey: form.targetKey,
        requiredPermission: form.requiredPermission.trim() || null,
        visibilityRule: button?.visibility_rule || {},
        inputMappings: button?.input_mappings || {},
        config: button?.config || {},
      };
      const response = await apiRequest(
        button?.id
          ? `/api/platform/objects/${encodeURIComponent(object.id)}/buttons/${encodeURIComponent(button.id)}`
          : `/api/platform/objects/${encodeURIComponent(object.id)}/buttons`,
        { method: button?.id ? "PUT" : "POST", body: JSON.stringify(payload) }
      );
      onSaved?.(response?.data || null);
    } catch (error) {
      onError?.(error?.message || "Unable to save button.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate() {
    if (!button?.id) return;
    setSaving(true);
    onError?.("");
    try {
      await apiRequest(
        `/api/platform/objects/${encodeURIComponent(object.id)}/buttons/${encodeURIComponent(button.id)}`,
        { method: "DELETE" }
      );
      onSaved?.(null);
    } catch (error) {
      onError?.(error?.message || "Unable to deactivate button.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="objects-rule-editor">
      <div className="objects-rule-editor-head">
        <div>
          <strong>{button?.id ? "Edit Button / Action" : "New Button / Action"}</strong>
          <span>{object?.label || object?.name || object?.object_key}</span>
        </div>
        <div className="objects-rule-editor-actions">
          {button?.id ? <button type="button" className="objects-rule-danger" disabled={saving} onClick={deactivate}>Deactivate</button> : null}
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="objects-rule-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>

      <div className="objects-rule-grid">
        <label>Label<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })}/></label>
        <label>API key<input value={form.buttonKey} readOnly={Boolean(button?.id)} onChange={(event) => setForm({ ...form, buttonKey: event.target.value })} placeholder="Auto from label"/></label>
        <label>Placement<select value={form.placement} onChange={(event) => setForm({ ...form, placement: event.target.value })}>
          {PLACEMENTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Style<select value={form.variant} onChange={(event) => setForm({ ...form, variant: event.target.value })}>
          {(variants.length ? variants : [{ key:"primary",label:"Primary" },{ key:"secondary",label:"Secondary" },{ key:"outline",label:"Outline" },{ key:"destructive",label:"Destructive" }]).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        <label>Target type<select value={form.targetType} onChange={(event) => setForm({ ...form, targetType: event.target.value, targetKey: "" })}>
          <option value="action">Registered action</option>
          <option value="workflow">Workflow</option>
          <option value="url">URL / link</option>
        </select></label>
        {form.targetType === "url" ? (
          <label>URL / path<input value={form.targetKey} onChange={(event) => setForm({ ...form, targetKey: event.target.value })} placeholder="https://example.com/object/{id} or /workspace/object/{id}"/><small>HTTPS or app-relative paths only. Use field placeholders such as {id} or {record_id}.</small></label>
        ) : (
          <label>Runs<select value={form.targetKey} onChange={(event) => setForm({ ...form, targetKey: event.target.value })}>
            <option value="">Select target</option>
            {targets.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>
        )}
        <label>Icon key<input value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} placeholder="Optional"/></label>
        <label>Required permission<input value={form.requiredPermission} onChange={(event) => setForm({ ...form, requiredPermission: event.target.value })} placeholder="Optional permission key"/></label>
      </div>
      <div className="objects-detail-placeholder">
        Visibility rules and input mappings remain layout/component metadata, so this object-level definition can be reused on multiple layouts without duplication.
      </div>
    </div>
  );
}
