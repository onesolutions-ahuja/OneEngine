import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import PlatformFieldPicker from "./PlatformFieldPicker.jsx";
import MetadataResourcePicker from "./MetadataResourcePicker.jsx";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none";

const WORKFLOW_VISUAL_CSS = `
  .workflow-visual-shell {
    display: grid;
    grid-template-columns: 230px minmax(460px, 1fr) 360px;
    gap: 12px;
    min-height: 620px;
    width: 100%;
    min-width: 0;
    align-items: stretch;
  }
  .workflow-node-palette,
  .workflow-properties-panel {
    min-width: 0;
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15,23,42,.06);
    overflow: hidden;
  }
  .workflow-node-palette {
    padding: 12px;
  }
  .workflow-palette-scroll {
    max-height: 548px;
    overflow: auto;
    padding-right: 3px;
  }
  .workflow-palette-item {
    display: flex;
    width: 100%;
    align-items: center;
    min-height: 36px;
    margin-bottom: 5px;
    padding: 7px 9px;
    border: 1px solid rgba(15,23,42,.08);
    border-radius: 9px;
    background: #fff;
    color: #334155;
    font-size: 12px;
    text-align: left;
    cursor: grab;
    transition: background .14s ease, border-color .14s ease, transform .14s ease;
  }
  .workflow-palette-item:hover {
    background: #f7faff;
    border-color: rgba(10,132,255,.32);
    transform: translateY(-1px);
  }
  .workflow-canvas-surface {
    position: relative;
    min-width: 0;
    min-height: 620px;
    overflow: auto;
    padding: 28px;
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 14px;
    background-color: #f8fafc;
    background-image: radial-gradient(circle, rgba(100,116,139,.23) 1px, transparent 1px);
    background-size: 18px 18px;
    box-shadow: inset 0 1px 5px rgba(15,23,42,.05);
  }
  .workflow-canvas-lane {
    width: min(100%, 580px);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .workflow-start-node {
    border: 1px solid #a7f3d0;
    border-radius: 999px;
    background: #ecfdf5;
    padding: 9px 18px;
    color: #065f46;
    font-size: 12px;
    font-weight: 700;
    box-shadow: 0 4px 12px rgba(5,150,105,.08);
  }
  .workflow-node-connector {
    width: 2px;
    height: 28px;
    background: #cbd5e1;
  }
  .workflow-node-wrap {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .workflow-node-card {
    width: 100%;
    min-height: 72px;
    padding: 13px 15px;
    border: 1px solid #dbe3ee;
    border-radius: 14px;
    background: rgba(255,255,255,.98);
    color: #1e293b;
    text-align: left;
    box-shadow: 0 6px 18px rgba(15,23,42,.06);
    cursor: pointer;
    transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease;
  }
  .workflow-node-card:hover {
    transform: translateY(-1px);
    border-color: #b8c8dc;
    box-shadow: 0 9px 22px rgba(15,23,42,.09);
  }
  .workflow-node-card.is-selected {
    border-color: #0a84ff;
    box-shadow: 0 0 0 3px rgba(10,132,255,.12), 0 9px 22px rgba(15,23,42,.09);
  }
  .workflow-node-card.is-disabled { opacity: .5; }
  .workflow-node-kind {
    display: block;
    margin-bottom: 3px;
    color: #7c8aa0;
    font-size: 9px;
    font-weight: 750;
    letter-spacing: .055em;
    text-transform: uppercase;
  }
  .workflow-node-title {
    display: block;
    color: #172033;
    font-size: 13px;
    font-weight: 720;
  }
  .workflow-node-note {
    display: block;
    margin-top: 6px;
    color: #64748b;
    font-size: 10px;
  }
  .workflow-properties-panel {
    padding: 12px;
    overflow: auto;
    max-height: 680px;
  }
  .workflow-properties-title,
  .workflow-palette-title {
    margin-bottom: 4px;
    color: #172033;
    font-size: 12px;
    font-weight: 750;
  }
  .workflow-palette-help {
    margin: 0 0 10px;
    color: #718096;
    font-size: 10px;
    line-height: 1.35;
  }
  @media (max-width: 1250px) {
    .workflow-visual-shell {
      grid-template-columns: 200px minmax(400px, 1fr) 320px;
    }
  }
  @media (max-width: 980px) {
    .workflow-visual-shell {
      grid-template-columns: 190px minmax(0, 1fr);
    }
    .workflow-properties-panel {
      grid-column: 1 / -1;
      max-height: none;
    }
  }
  @media (max-width: 720px) {
    .workflow-visual-shell {
      grid-template-columns: 1fr;
    }
    .workflow-node-palette,
    .workflow-properties-panel {
      max-height: 300px;
    }
    .workflow-canvas-surface {
      min-height: 520px;
      padding: 18px;
    }
  }
`;

const actionOptions = [
  { value: "CREATE_RECORD", label: "Create Record" },
  { value: "UPDATE_RECORD", label: "Update Record" },
  { value: "UPDATE_RELATED_RECORD", label: "Update Related Record" },
  { value: "CREATE_RELATED_RECORD", label: "Create Related Record" },
  { value: "DELETE_RECORD", label: "Delete Record" },
  { value: "ASSIGN_RECORD", label: "Assign Record" },
  { value: "ADD_RELATIONSHIP", label: "Add Relationship" },
  { value: "REMOVE_RELATIONSHIP", label: "Remove Relationship" },
  { value: "IN_APP_NOTIFICATION", label: "In-App Notification" },
  { value: "SEND_EMAIL", label: "Send Email" },
  { value: "SEND_SMS", label: "Send SMS" },
  { value: "SEND_WHATSAPP", label: "Send WhatsApp" },
  { value: "CALL_FUNCTION", label: "Call Function" },
  { value: "RUN_SUBFLOW", label: "Run Subflow" },
  { value: "WEBHOOK", label: "Webhook" },
  { value: "CONDITION", label: "Condition" },
  { value: "WAIT", label: "Wait" },
  { value: "STOP", label: "Stop" },
];

function blankCondition() {
  return { id: Date.now() + Math.random(), field: "", operator: "equals", value: "" };
}

function makeStep(type = "CREATE_RECORD") {
  return {
    id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    enabled: true,
    expanded: true,
    type,
    label: actionOptions.find((option) => option.value === type)?.label || "Action",
    config: {
      object: "orders",
      recordId: "",
      fieldMappings: { status: "status" },
      template: "",
      templateId: "",
      recipient: "customer.email",
      providerStatus: "not-configured",
      functionKey: "",
      inputs: { value: "hello" },
      workflowId: "",
      workflowInputs: { order_id: "{{id}}" },
      condition: { type: "all", rules: [blankCondition()] },
      ifBranch: [],
      elseBranch: [],
      durationSeconds: 60,
      reason: "",
      url: "",
      method: "POST",
      message: "",
      title: "",
    },
  };
}

function getActionLabel(type) {
  return actionOptions.find((option) => option.value === type)?.label || "Action";
}

/* Trigger values arrive as machine keys ("after_update"); the canvas Start
   pill and the workflow list present them in words. */
const TRIGGER_LABELS = {
  after_create: "When a record is created",
  after_update: "When a record is updated",
  after_save: "When a record is created or updated",
  manual: "Manual trigger",
  system_function: "System function",
  system_action: "System action",
  system_job: "System job trigger",
};
const getTriggerLabel = (value) => TRIGGER_LABELS[value] || value || "Manual trigger";

const RECORD_ACTION_TYPES = new Set([
  "CREATE_RECORD","UPDATE_RECORD","UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD",
  "DELETE_RECORD","ASSIGN_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP",
]);

function conditionIsValid(condition) {
  const rules = Array.isArray(condition?.rules) ? condition.rules : [];
  if (!rules.length) return false;
  return rules.every((rule) => {
    if (!rule?.field) return false;
    const operator = rule.operator || "equals";
    if (["is_empty","changed"].includes(operator)) return true;
    return rule.value !== undefined && rule.value !== null && String(rule.value).trim() !== "";
  });
}

function workflowActionIssue(step) {
  if (!step || step.enabled === false) return "";
  const config = step.config || {};
  if (step.type === "CONDITION") {
    return conditionIsValid(config.condition) ? "" : "Complete the condition field/operator/value.";
  }
  if (RECORD_ACTION_TYPES.has(step.type) && !config.object) return "Choose the target object.";
  if (["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP"].includes(step.type)) {
    if (!config.templateId && !config.template) return "Choose a message template.";
    if (!config.recipient) return "Choose a recipient.";
  }
  if (step.type === "IN_APP_NOTIFICATION" && (!config.title || !config.message || !config.recipient)) {
    return "Add title, message and recipient.";
  }
  if (step.type === "CALL_FUNCTION" && !config.functionKey) return "Choose a registered function.";
  if (step.type === "RUN_SUBFLOW" && !config.workflowId) return "Choose a subflow.";
  if (step.type === "WEBHOOK" && !config.url) return "Enter the webhook URL.";
  if (step.type === "WAIT" && !Number(config.durationSeconds || 0) && !config.resumeAt) return "Set a wait duration or resume time.";
  return "";
}

function FlowGuide({ steps, current, onSelect }) {
  return (
    <div className="one-flow-guide" aria-label="Flow builder progress">
      {steps.map((step, index) => (
        <button
          key={step.key}
          type="button"
          className={`one-flow-guide-step is-${step.status} ${current === step.key ? "is-current" : ""}`}
          onClick={() => onSelect(step.key)}
          title={step.message || step.label}
        >
          <span className="one-flow-guide-dot">
            {step.status === "complete" ? "✓" : step.status === "error" ? "!" : index + 1}
          </span>
          <span className="one-flow-guide-copy">
            <strong>{step.label}</strong>
            <small>{step.message || (step.status === "complete" ? "Complete" : "Not configured")}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function ProviderStatusPill({ available }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium ${available ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
      {available ? "Provider configured" : "Provider not configured"}
    </span>
  );
}

function StepConditionEditor({ value, onChange, objectKey }) {
  const config = value || { type: "all", rules: [blankCondition()] };
  const update = (patch) => onChange({ ...config, ...patch });

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">Condition</span>
        <select className={inputClass} value={config.type || "all"} onChange={(event) => update({ type: event.target.value })}>
          <option value="all">IF ALL</option>
          <option value="any">IF ANY</option>
        </select>
      </div>
      {(config.rules || []).map((rule, index) => (
        <div className="grid gap-2 md:grid-cols-[1.2fr_0.9fr_1fr_auto]" key={rule.id || index}>
          <PlatformFieldPicker selectedObjectKey={objectKey} value={rule.field || ""} label="Field" onChange={(field) => {
            const next = [...(config.rules || [])];
            next[index] = { ...rule, field };
            update({ rules: next });
          }} />
          <select className={inputClass} value={rule.operator || "equals"} onChange={(event) => {
            const next = [...(config.rules || [])];
            next[index] = { ...rule, operator: event.target.value };
            update({ rules: next });
          }}>
            <option value="equals">Equals</option>
            <option value="not_equals">Not equal</option>
            <option value="greater_than">Greater than</option>
            <option value="less_than">Less than</option>
            <option value="changed">Changed</option>
            <option value="changed_from">Changed from</option>
            <option value="changed_to">Changed to</option>
            <option value="changed_from_to">Changed from/to</option>
            <option value="is_empty">Is empty</option>
          </select>
          <input className={inputClass} value={rule.value || ""} onChange={(event) => {
            const next = [...(config.rules || [])];
            next[index] = { ...rule, value: event.target.value };
            update({ rules: next });
          }} placeholder="Value" disabled={["is_empty"].includes(rule.operator)} />
          <button type="button" className="rounded border border-slate-200 px-2 text-sm text-slate-600" onClick={() => {
            const next = [...(config.rules || [])].filter((_, itemIndex) => itemIndex !== index);
            update({ rules: next.length ? next : [blankCondition()] });
          }}>Remove</button>
        </div>
      ))}
      <button type="button" className="text-sm text-blue-700" onClick={() => update({ rules: [...(config.rules || []), blankCondition()] })}>+ Add condition</button>
    </div>
  );
}

function StepEditor({ step, index, updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], rootObjectKey, scopeKey = null }) {
  const updateConfig = (patch) => updateStep(index, { config: { ...(step.config || {}), ...patch } });
  const updateFieldMapping = (key, value) => {
    const fieldMappings = { ...(step.config?.fieldMappings || {}) };
    fieldMappings[key] = value;
    updateConfig({ fieldMappings });
  };

  const renderConfig = () => {
    switch (step.type) {
      case "CREATE_RECORD":
      case "UPDATE_RECORD":
      case "UPDATE_RELATED_RECORD":
      case "CREATE_RELATED_RECORD":
      case "DELETE_RECORD":
      case "ASSIGN_RECORD":
      case "ADD_RELATIONSHIP":
      case "REMOVE_RELATIONSHIP": {
        return (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Object</label>
                <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector selectedObjectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Record source</label>
                <MetadataResourcePicker objectKey={rootObjectKey} label="Record / related record" value={step.config?.recordId || ""} onChange={(recordId) => updateConfig({ recordId })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field mappings</label>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {Object.entries(step.config?.fieldMappings || { status: "status" }).map(([key, value], mappingIndex) => (
                  <div className="grid gap-2 md:grid-cols-2" key={`${key}-${mappingIndex}`}>
                    <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={key} label="Target field" onChange={(field) => {
                      const next = { ...(step.config?.fieldMappings || {}) };
                      const currentValue = next[key];
                      delete next[key];
                      next[field] = currentValue;
                      updateConfig({ fieldMappings: next });
                    }} />
                    <MetadataResourcePicker objectKey={rootObjectKey} label="Source value" value={value} onChange={(source) => updateFieldMapping(key, source)} />
                  </div>
                ))}
                <button type="button" className="text-sm text-blue-700" onClick={() => updateConfig({ fieldMappings: { ...(step.config?.fieldMappings || {}), [`field_${Object.keys(step.config?.fieldMappings || {}).length + 1}`]: "" } })}>+ Add mapping</button>
              </div>
            </div>
          </div>
        );
      }
      case "SEND_EMAIL":
      case "SEND_SMS":
      case "SEND_WHATSAPP": {
        const available = providerAvailable[step.type === "SEND_EMAIL" ? "EMAIL" : step.type === "SEND_SMS" ? "SMS" : "WHATSAPP"];
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-sm font-medium text-slate-700">{step.type}</span>
              <ProviderStatusPill available={available} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Template</label>
              <select className={inputClass} value={step.config?.templateId || step.config?.template || ""} onChange={(event) => updateConfig({ templateId: event.target.value, template: "" })}>
                <option value="">Select message template</option>
                {messageTemplates
                  .filter((template) => String(template.channel || "").toUpperCase() === (step.type === "SEND_EMAIL" ? "EMAIL" : step.type === "SEND_SMS" ? "SMS" : "WHATSAPP"))
                  .map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipient mapping</label>
              <input className={inputClass} value={step.config?.recipient || ""} onChange={(event) => updateConfig({ recipient: event.target.value })} placeholder="customer.email / order.contact / team" />
              <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value="" label="Insert recipient field" onInsert={(token) => updateConfig({ recipient: token })} />
            </div>
          </div>
        );
      }
      case "IN_APP_NOTIFICATION":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Title</label>
              <input className={inputClass} value={step.config?.title || ""} onChange={(event) => updateConfig({ title: event.target.value })} placeholder="Notification title" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Message</label>
              <textarea className={inputClass} value={step.config?.message || ""} onChange={(event) => updateConfig({ message: event.target.value })} rows={3} placeholder="Message text or template" />
              <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value="" label="Insert message field" onInsert={(token) => updateConfig({ message: `${step.config?.message || ""}${token}` })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipient mapping</label>
              <input className={inputClass} value={step.config?.recipient || ""} onChange={(event) => updateConfig({ recipient: event.target.value })} placeholder="user.id / team" />
            </div>
          </div>
        );
      case "CALL_FUNCTION":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Registered function</label>
              <select className={inputClass} value={step.config?.functionKey || ""} onChange={(event) => updateConfig({ functionKey: event.target.value })}>
                <option value="">Select a registered function</option>
                {step.config?.functionKey && !functionRegistry.some((item) => item.key === step.config.functionKey) ? <option value={step.config.functionKey} disabled>{step.config.functionKey} (unavailable)</option> : null}
                {functionRegistry.map((item) => <option key={item.key} value={item.key}>{item.displayName || item.key}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Inputs</label>
              <textarea className={inputClass} value={JSON.stringify(step.config?.inputs || {}, null, 2)} onChange={(event) => {
                try {
                  updateConfig({ inputs: JSON.parse(event.target.value) || {} });
                } catch {
                  updateConfig({ inputs: { value: event.target.value } });
                }
              }} rows={4} />
            </div>
          </div>
        );
      case "RUN_SUBFLOW":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Workflow</label>
              <select className={inputClass} value={step.config?.workflowId || ""} onChange={(event) => updateConfig({ workflowId: event.target.value })}>
                <option value="">Select a saved workflow</option>
                {step.config?.workflowId && !availableWorkflows.some((item) => String(item.id) === String(step.config.workflowId)) ? <option value={step.config.workflowId} disabled>{step.config.workflowId} (unavailable)</option> : null}
                {availableWorkflows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {!availableWorkflows.length ? <p className="text-xs text-slate-500">Save another active workflow before selecting a subflow.</p> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Input mapping</label>
              <textarea className={inputClass} value={JSON.stringify(step.config?.workflowInputs || {}, null, 2)} onChange={(event) => {
                try {
                  updateConfig({ workflowInputs: JSON.parse(event.target.value) || {} });
                } catch {
                  updateConfig({ workflowInputs: { value: event.target.value } });
                }
              }} rows={4} />
            </div>
          </div>
        );
      case "CONDITION":
        return (
          <div className="space-y-3">
            <StepConditionEditor objectKey={step.config?.object || ""} value={step.config?.condition || { type: "all", rules: [blankCondition()] }} onChange={(condition) => updateConfig({ condition })} />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">IF branch</label>
              <input className={inputClass} value={step.config?.ifBranch?.join(", ") || ""} onChange={(event) => updateConfig({ ifBranch: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Matching steps" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">ELSE branch</label>
              <input className={inputClass} value={step.config?.elseBranch?.join(", ") || ""} onChange={(event) => updateConfig({ elseBranch: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Fallback steps" />
            </div>
          </div>
        );
      case "WAIT":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Duration (seconds)</label>
              <input className={inputClass} type="number" min="0" value={step.config?.durationSeconds || 0} onChange={(event) => updateConfig({ durationSeconds: Number(event.target.value || 0) })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Resume at</label>
              <input className={inputClass} type="datetime-local" value={step.config?.resumeAt || ""} onChange={(event) => updateConfig({ resumeAt: event.target.value })} />
            </div>
          </div>
        );
      case "STOP":
        return (
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Optional reason</label>
            <input className={inputClass} value={step.config?.reason || ""} onChange={(event) => updateConfig({ reason: event.target.value })} placeholder="Stop reason" />
          </div>
        );
      case "WEBHOOK":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">URL</label>
              <input className={inputClass} value={step.config?.url || ""} onChange={(event) => updateConfig({ url: event.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Method</label>
              <select className={inputClass} value={step.config?.method || "POST"} onChange={(event) => updateConfig({ method: event.target.value })}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" onClick={() => moveStep(index, -1)} title="Move up">↑</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" onClick={() => moveStep(index, 1)} title="Move down">↓</button>
          <span className="text-sm font-semibold text-slate-700">{index + 1}. {getActionLabel(step.type)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" onClick={() => duplicateStep(index)} title="Duplicate">Duplicate</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" onClick={() => updateStep(index, { enabled: !step.enabled })}>{step.enabled ? "Disable" : "Enable"}</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" onClick={() => addStepAt(index)} title="Add step before">+ Add Step</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600" onClick={() => addStepAt(index + 1)} title="Add step after">+ Add After</button>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 text-xs text-red-600" onClick={() => deleteStep(index)}>Delete</button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select className={inputClass} value={step.type} onChange={(event) => updateStep(index, { type: event.target.value, label: getActionLabel(event.target.value) })}>
            {registryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600" onClick={() => updateStep(index, { expanded: !step.expanded })}>{step.expanded ? "Collapse" : "Expand"}</button>
        </div>

        {step.expanded && (
          <div className="pt-1">{renderConfig()}</div>
        )}
      </div>
    </div>
  );
}


function WorkflowCanvas({ workflow, workflowId, setWorkflow, updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], scopeKey = null, onGuideStepChange }) {
  const [selectedId, setSelectedId] = useState(workflow.steps?.[0]?.id || null);
  const selectedIndex = Math.max(0, workflow.steps.findIndex((step) => step.id === selectedId));
  const selectedStep = workflow.steps[selectedIndex] || null;
  const addFromPalette = (type, index = workflow.steps.length) => {
    const step = makeStep(type);
    setWorkflow((current) => ({ ...current, steps: [...current.steps.slice(0, index), step, ...current.steps.slice(index)] }));
    setSelectedId(step.id);
  };
  const dropAt = (event, index) => {
    event.preventDefault();
    const paletteType = event.dataTransfer.getData("application/x-onepos-flow-element");
    if (paletteType) return addFromPalette(paletteType, index);
    const sourceId = event.dataTransfer.getData("application/x-onepos-flow-node");
    const from = workflow.steps.findIndex((step) => step.id === sourceId);
    if (from < 0 || from === index) return;
    setWorkflow((current) => {
      const next = [...current.steps];
      const [moved] = next.splice(from, 1);
      const target = Math.max(0, index > from ? index - 1 : index);
      next.splice(target, 0, moved);
      return { ...current, steps: next };
    });
  };
  const palette = registryOptions.filter((option) => option.value !== "WHEN");
  return (
    <div className="workflow-visual-shell">
      <aside className="workflow-node-palette">
        <div className="workflow-palette-title">Elements</div>
        <p className="workflow-palette-help">Drag an element onto the flow. Registered actions appear automatically.</p>
        <div className="workflow-palette-scroll">
          {palette.map((option) => <button key={option.value} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("application/x-onepos-flow-element", option.value)} onClick={() => addFromPalette(option.value)} className="workflow-palette-item">{option.label}</button>)}
        </div>
      </aside>
      <main className="workflow-canvas-surface" onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropAt(e, workflow.steps.length)}>
        <div className="workflow-canvas-lane">
          <div className="workflow-start-node">Start · {getTriggerLabel(workflow.trigger)}</div>
          <div className="workflow-node-connector" />
          {workflow.steps.map((step, index) => <div key={step.id} className="workflow-node-wrap" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); dropAt(e, index); }}>
            <button type="button" draggable onDragStart={(e) => e.dataTransfer.setData("application/x-onepos-flow-node", step.id)} onClick={() => { setSelectedId(step.id); onGuideStepChange?.(step.type === "CONDITION" ? "conditions" : "actions"); }} className={`workflow-node-card ${selectedId === step.id ? "is-selected" : ""} ${step.enabled === false ? "is-disabled" : ""}`}>
              <span className="workflow-node-kind">{getActionLabel(step.type)}</span>
              <span className="workflow-node-title">{step.label || getActionLabel(step.type)}</span>
              {step.type === "CONDITION" ? <span className="workflow-node-note">Decision branches are evaluated from metadata conditions.</span> : null}
            </button>
            {index < workflow.steps.length - 1 ? <div className="workflow-node-connector" /> : null}
          </div>)}
          {!workflow.steps.length ? <button type="button" className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-5 text-sm text-blue-700" onClick={() => addFromPalette("CREATE_RECORD")}>+ Add first element</button> : null}
          <div className="mt-3 text-center text-xs text-slate-400">Drop elements here to append · drag nodes to reorder</div>
        </div>
      </main>
      <aside className="workflow-properties-panel">
        <div className="workflow-properties-title">Properties</div>
        {selectedStep ? <StepEditor step={selectedStep} index={selectedIndex} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={(index) => { deleteStep(index); setSelectedId(null); }} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={availableWorkflows.filter((item) => item.active !== false && String(item.id) !== String(workflowId || ""))} messageTemplates={messageTemplates} rootObjectKey={workflow.object || ""} scopeKey={scopeKey} /> : <p className="text-sm text-slate-500">Select a flow element to configure it.</p>}
      </aside>
    </div>
  );
}

export default function WorkflowAdmin({ onMessage, onError, scopeKey = null, title = "Workflows", description = "Create and manage workflow builder configurations.", embedded = false, initialWorkflow = null, onClose, onSaved }) {
  const normalizedInitialWorkflow = initialWorkflow ? {
    id: initialWorkflow.id || null,
    name: initialWorkflow.name || "",
    object: initialWorkflow.object || initialWorkflow.object_key || initialWorkflow.objectKey || "",
    objectId: initialWorkflow.objectId || initialWorkflow.object_id || null,
    objectKey: initialWorkflow.objectKey || initialWorkflow.object_key || initialWorkflow.object || "",
    trigger: initialWorkflow.trigger || initialWorkflow.trigger_key || initialWorkflow.triggerKey || "manual",
    version: Number(initialWorkflow.version || 1),
    lifecycleStatus: initialWorkflow.lifecycleStatus || initialWorkflow.lifecycle_status || (initialWorkflow.active === false ? "INACTIVE" : "ACTIVE"),
    active: initialWorkflow.active !== false,
    conditions: initialWorkflow.conditions || [],
    match: initialWorkflow.action?.match || initialWorkflow.match || "all",
    steps: (initialWorkflow.steps || initialWorkflow.action?.actions || []).map((step) => ({
      ...makeStep(step.type || step.key || "CREATE_RECORD"),
      ...step,
      type: step.type || step.key || "CREATE_RECORD",
      enabled: step.enabled !== false,
      label: step.label || getActionLabel(step.type || step.key),
      config: {
        ...(makeStep(step.type || step.key || "CREATE_RECORD").config),
        ...(step.config || {}),
        ...Object.fromEntries(Object.entries(step).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))),
      },
    })),
  } : null;
  const [workflowId, setWorkflowId] = useState(() => normalizedInitialWorkflow?.id || null);
  const [workflow, setWorkflow] = useState(() => {
    if (normalizedInitialWorkflow) return normalizedInitialWorkflow;
    try {
      const cached = scopeKey ? null : localStorage.getItem("onepos_workflow_builder");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.steps)) {
          return {
            ...parsed,
            steps: parsed.steps.map((step) => ({
              ...makeStep(step.type || "CREATE_RECORD"),
              ...step,
              config: {
                ...(makeStep(step.type || "CREATE_RECORD").config),
                ...(step.config || {}),
              },
            })),
          };
        }
      }
    } catch {
      // no-op: fall back to a fresh draft
    }

    return {
      name: scopeKey === "whatsapp_assistant" ? "WhatsApp Assistant Workflow" : "Order Ready Workflow",
      object: scopeKey === "whatsapp_assistant" ? "" : "orders",
      trigger: scopeKey === "whatsapp_assistant" ? "whatsapp_message_received" : "after_update",
      version: 1,
      lifecycleStatus: "DRAFT",
      active: false,
      steps: scopeKey === "whatsapp_assistant"
        ? [
            { ...makeStep("WHEN"), type: "CONDITION", label: "Condition" },
            { ...makeStep("SEND_WHATSAPP"), config: { ...makeStep("SEND_WHATSAPP").config, template: "", recipient: "customer.phone" } },
          ]
        : [
            { ...makeStep("WHEN"), type: "CONDITION", label: "Condition" },
            { ...makeStep("CREATE_RECORD"), config: { ...makeStep("CREATE_RECORD").config, object: "orders", fieldMappings: { status: "status" } } },
            { ...makeStep("SEND_SMS"), config: { ...makeStep("SEND_SMS").config, template: "order_status", recipient: "customer.phone" } },
          ],
    };
  });

  const [guideStep, setGuideStep] = useState("trigger");
  const [showBuilder, setShowBuilder] = useState(embedded);
  const [savedWorkflows, setSavedWorkflows] = useState(() => {
    if (embedded && normalizedInitialWorkflow) return [normalizedInitialWorkflow];
    try {
      const cached = scopeKey ? null : localStorage.getItem("onepos_workflow_builder");
      const parsed = cached ? JSON.parse(cached) : null;
      return parsed && typeof parsed === "object" ? [parsed] : [];
    } catch {
      return [];
    }
  });
  const [providerAvailable, setProviderAvailable] = useState({ EMAIL: false, SMS: false, WHATSAPP: false });
  const [registryOptions, setRegistryOptions] = useState(scopeKey ? [] : actionOptions);
  const [functionRegistry, setFunctionRegistry] = useState([]);
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [workflowListSearch, setWorkflowListSearch] = useState("");
  const [workflowListFilter, setWorkflowListFilter] = useState("all");


  useEffect(() => {
    if (!embedded) return;
    if (normalizedInitialWorkflow) {
      setWorkflowId(normalizedInitialWorkflow.id || null);
      setWorkflow(normalizedInitialWorkflow);
    } else {
      setWorkflowId(null);
      setWorkflow({
        name: "",
        object: "",
        trigger: "manual",
        version: 1,
        lifecycleStatus: "DRAFT",
        active: false,
        steps: [],
      });
    }
    setShowBuilder(true);
  }, [embedded, initialWorkflow?.id]);

  useEffect(() => {
    apiRequest(scopeKey
      ? `/api/platform/workflow-resources?scope=${encodeURIComponent(scopeKey)}`
      : "/api/platform/workflow-actions")
      .then((response) => {
        const source = scopeKey ? response?.data?.actions : response?.data;
        const registry = (Array.isArray(source) ? source : []).map((item) => ({ value: item.key, label: item.displayName || item.key }));
        if (registry.length) setRegistryOptions(registry);
      })
      .catch(() => {});
  }, [scopeKey]);

  useEffect(() => {
    apiRequest("/api/platform/function-registry")
      .then((response) => setFunctionRegistry(Array.isArray(response?.data) ? response.data : []))
      .catch((error) => onError?.(error.message || "Unable to load registered functions"));
  }, [onError]);

  useEffect(() => {
    apiRequest("/api/platform/message-templates")
      .then((response) => setMessageTemplates(Array.isArray(response?.data) ? response.data.filter((item) => item.active !== false) : []))
      .catch(() => setMessageTemplates([]));
  }, []);

  useEffect(() => {
    apiRequest("/api/platform/rules")
      .then((response) => {
        const rules = Array.isArray(response?.data) ? response.data : [];
        const workflows = rules
          .filter((rule) => rule?.action?.type === "workflow")
          .filter((rule) => !scopeKey || rule?.action?.scope === scopeKey)
          .map((rule) => ({
          ...rule,
          id: rule.id,
          name: rule.name,
          object: rule.object_key || rule.object || "",
          trigger: rule.trigger_key,
          active: rule.active !== false,
          scope: rule.action.scope || null,
          systemGenerated: rule.action.systemGenerated === true,
          systemKey: rule.action.systemKey || null,
          capabilityType: rule.action.capabilityType || null,
          capabilityKey: rule.action.capabilityKey || null,
          steps: (rule.action.actions || []).map((action) => ({
            ...makeStep(action.type || action.key),
            type: action.type || action.key,
            config: { ...makeStep(action.type || action.key).config, ...action },
          })),
        }));
        setSavedWorkflows(workflows);
      })
      .catch((error) => onError?.(error.message || "Unable to load workflows"));
  }, [onError]);

  useEffect(() => {
    apiRequest("/api/integrations")
      .then((response) => {
        const integrations = Array.isArray(response?.data) ? response.data : [];
        const nextState = { EMAIL: false, SMS: false, WHATSAPP: false };
        for (const item of integrations) {
          const provider = String(item.provider || "").toUpperCase();
          if (provider === "EMAIL" || provider === "SMS" || provider === "WHATSAPP") {
            nextState[provider] = Boolean(item.active !== false && item.configuration && Object.keys(item.configuration || {}).length > 0);
          }
        }
        setProviderAvailable(nextState);
      })
      .catch(() => {
        setProviderAvailable({ EMAIL: false, SMS: false, WHATSAPP: false });
      });
  }, []);

  const updateStep = (index, patch) => {
    setWorkflow((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, ...patch } : step)),
    }));
  };

  const addStepAt = (index, type = "CREATE_RECORD") => {
    const nextStep = makeStep(type);
    setWorkflow((current) => ({
      ...current,
      steps: [...current.steps.slice(0, index), nextStep, ...current.steps.slice(index)],
    }));
  };

  const moveStep = (index, direction) => {
    setWorkflow((current) => {
      const next = [...current.steps];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, steps: next };
    });
  };

  const duplicateStep = (index) => {
    setWorkflow((current) => ({
      ...current,
      steps: [...current.steps.slice(0, index + 1), { ...current.steps[index], id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}` }, ...current.steps.slice(index + 1)],
    }));
  };

  const deleteStep = (index) => {
    setWorkflow((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
    }));
  };

  const enabledSteps = (workflow.steps || []).filter((step) => step.enabled !== false);
  const conditionSteps = enabledSteps.filter((step) => step.type === "CONDITION");
  const actionSteps = enabledSteps.filter((step) => step.type !== "CONDITION");
  const triggerNeedsObject = !["manual","whatsapp_message_received","system_function","system_action","system_job"].includes(workflow.trigger);
  const triggerIssue = !workflow.trigger
    ? "Choose a trigger."
    : triggerNeedsObject && !workflow.object
      ? "Choose the trigger object."
      : "";
  const conditionIssue = conditionSteps.length && conditionSteps.some((step) => workflowActionIssue(step))
    ? "One or more conditions are incomplete."
    : "";
  const actionIssues = actionSteps.map(workflowActionIssue).filter(Boolean);
  const actionsIssue = !actionSteps.length
    ? "Add at least one action."
    : actionIssues[0] || "";
  const reviewIssue = triggerIssue || conditionIssue || actionsIssue || (!workflow.name ? "Enter a workflow name." : "");
  const guideSteps = [
    { key: "trigger", label: "Trigger", status: triggerIssue ? "error" : "complete", message: triggerIssue },
    {
      key: "conditions",
      label: "Conditions",
      status: conditionIssue ? "error" : conditionSteps.length ? "complete" : "idle",
      message: conditionIssue || (conditionSteps.length ? "" : "Optional"),
    },
    { key: "actions", label: "Actions", status: actionsIssue ? "error" : "complete", message: actionsIssue },
    { key: "review", label: "Review", status: reviewIssue ? "error" : "complete", message: reviewIssue },
  ];

  const navigateGuide = (key) => {
    setGuideStep(key);
    const targetId = key === "trigger" ? "workflow-trigger-section"
      : key === "review" ? "workflow-review-section"
        : "workflow-canvas-section";
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveWorkflow = () => {
    const payload = {
      objectId: workflow.objectId || null,
      objectKey: workflow.objectKey || workflow.object || null,
      name: workflow.name,
      triggerKey: workflow.trigger,
      conditions: workflow.conditions || [],
      version: Number(workflow.version || 1),
      lifecycleStatus: String(workflow.lifecycleStatus || (workflow.active === true ? "ACTIVE" : "DRAFT")).toUpperCase(),
      active: workflow.active === true,
      action: {
        type: "workflow",
        ...(scopeKey ? { scope: scopeKey } : {}),
        ...(workflow.systemGenerated ? {
          systemGenerated: true,
          systemKey: workflow.systemKey || null,
          capabilityType: workflow.capabilityType || null,
          capabilityKey: workflow.capabilityKey || null,
          scope: workflow.scope || "system",
        } : {}),
        match: workflow.match || "all",
        actions: workflow.steps.filter((step) => step.enabled !== false).map((step) => {
          const config = { ...(step.config || {}) };
          if (config.fieldMappings && !config.fieldValues) config.fieldValues = config.fieldMappings;
          if (config.template && !config.templateId) config.templateId = config.template;
          return { type: step.type, ...config };
        }),
      },
    };
    const request = workflowId
      ? apiRequest(`/api/platform/rules/${workflowId}`, { method: "PUT", body: JSON.stringify(payload) })
      : apiRequest("/api/platform/rules", { method: "POST", body: JSON.stringify(payload) });
    request.then((response) => {
      const saved = response?.data || {};
      setWorkflowId(saved.id || workflowId);
      setSavedWorkflows((current) => [{ ...workflow, ...saved, id: saved.id || workflowId }, ...current.filter((item) => item.id !== (saved.id || workflowId))]);
      if (embedded) {
        onSaved?.({ ...workflow, ...saved, id: saved.id || workflowId });
      } else {
        setShowBuilder(false);
      }
      onMessage?.("Workflow saved.");
    }).catch((error) => onError?.(error.message || "Unable to save workflow."));
  };

  const visibleSavedWorkflows = savedWorkflows.filter((item) => {
    const system = item.systemGenerated === true || item.scope === "system";
    if (workflowListFilter === "system" && !system) return false;
    if (workflowListFilter === "user" && system) return false;
    const query = workflowListSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.name, item.trigger, item.capabilityType, item.capabilityKey, item.object]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  if (!showBuilder && !embedded) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="text-sm text-slate-500">{description}</p>
          </div>
          <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={() => setShowBuilder(true)}>+ New Workflow</button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Version
              <input className={inputClass} value={workflow.version || 1} onChange={(event) => setWorkflow((current) => ({ ...current, version: Number(event.target.value || 1) }))} />
            </label>
            <label className="text-sm font-medium text-slate-700">Lifecycle
              <select className={inputClass} value={workflow.lifecycleStatus || "DRAFT"} onChange={(event) => setWorkflow((current) => ({ ...current, lifecycleStatus: event.target.value, active: event.target.value === "ACTIVE" }))}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => setWorkflow((current) => ({ ...current, lifecycleStatus: "ACTIVE", active: true }))}>Activate</button>
              <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700" onClick={() => setWorkflow((current) => ({ ...current, lifecycleStatus: "INACTIVE", active: false }))}>Deactivate</button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={inputClass}
            style={{ maxWidth: 360 }}
            value={workflowListSearch}
            onChange={(event) => setWorkflowListSearch(event.target.value)}
            placeholder="Search workflows..."
          />
          <select className={inputClass} style={{ maxWidth: 180 }} value={workflowListFilter} onChange={(event) => setWorkflowListFilter(event.target.value)}>
            <option value="all">All workflows</option>
            <option value="system">System workflows</option>
            <option value="user">User workflows</option>
          </select>
          <span className="text-xs text-slate-500">{visibleSavedWorkflows.length} shown · {savedWorkflows.length} total</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white">
          {visibleSavedWorkflows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No workflows match this view.</div>
          ) : visibleSavedWorkflows.map((item, index) => (
            <div key={`${item.name || "workflow"}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 last:border-b-0">
              <div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm text-slate-800">{item.name || "Unnamed workflow"}</strong>
                  {item.systemGenerated || item.scope === "system" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">SYSTEM</span> : null}
                </div>
                <span className="block text-xs text-slate-500">
                  {item.object || "No trigger object"} · {getTriggerLabel(item.trigger)}
                  {item.capabilityKey ? ` · ${item.capabilityType || "capability"}: ${item.capabilityKey}` : ""}
                </span>
              </div>
              <div className="flex gap-3">
                <button type="button" className="text-sm text-blue-700" onClick={() => { setWorkflowId(item.id || null); setWorkflow(item); setShowBuilder(true); }}>Edit</button>
                {item.id ? <button type="button" className="text-sm text-slate-600" onClick={() => {
                  const nextActive = item.active === false;
                  apiRequest(`/api/platform/rules/${item.id}`, { method: "PUT", body: JSON.stringify({
                    name: item.name,
                    triggerKey: item.trigger,
                    conditions: item.conditions || [],
                    active: nextActive,
                    action: {
                      type: "workflow",
                      ...(scopeKey ? { scope: scopeKey } : {}),
                      ...(item.systemGenerated ? {
                        systemGenerated: true,
                        systemKey: item.systemKey || null,
                        capabilityType: item.capabilityType || null,
                        capabilityKey: item.capabilityKey || null,
                        scope: item.scope || "system",
                      } : {}),
                      match: item.match || "all",
                      actions: (item.steps || []).filter((step) => step.enabled !== false).map((step) => ({ type: step.type, ...(step.config || {}), fieldValues: step.config?.fieldValues || step.config?.fieldMappings }))
                    },
                  }) }).then(() => setSavedWorkflows((current) => current.map((entry) => entry.id === item.id ? { ...entry, active: nextActive } : entry))).catch((error) => onError?.(error.message));
                }}>{item.active === false ? "Activate" : "Deactivate"}</button> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <style>{WORKFLOW_VISUAL_CSS}</style>
      <FlowGuide steps={guideSteps} current={guideStep} onSelect={navigateGuide} />
      <div id="workflow-trigger-section" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Workflow name</label>
            <input className={inputClass} value={workflow.name || ""} onChange={(event) => setWorkflow((current) => ({ ...current, name: event.target.value }))} placeholder="Workflow name" />
          </div>
          <div className="min-w-[220px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Trigger object</label>
            <PlatformFieldPicker
              scopeKey={scopeKey}
              includeObjectSelector
              objectOnly
              selectedObjectKey={workflow.object || ""}
              onObjectChange={(object) => setWorkflow((current) => ({ ...current, object }))}
            />
          </div>
          <div className="min-w-[180px]">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Trigger</label>
            <select className={inputClass} value={workflow.trigger || "after_update"} onChange={(event) => setWorkflow((current) => ({ ...current, trigger: event.target.value }))}>
              {scopeKey === "whatsapp_assistant" ? <option value="whatsapp_message_received">WhatsApp message received</option> : null}
              {workflow.systemGenerated ? <option value="system_function">System function</option> : null}
              {workflow.systemGenerated ? <option value="system_action">System action</option> : null}
              {workflow.systemGenerated ? <option value="system_job">System job trigger</option> : null}
              <option value="after_create">Record created</option>
              <option value="after_update">Record updated</option>
              <option value="after_save">Created or updated</option>
              <option value="manual">Manual trigger</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" className="rounded border border-slate-200 px-4 py-2 text-sm text-slate-600" onClick={() => embedded ? onClose?.() : setShowBuilder(false)}>Cancel</button>
            <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={saveWorkflow}>Save workflow</button>
          </div>
        </div>
      </div>

      <div id="workflow-canvas-section">
        <WorkflowCanvas workflow={workflow} workflowId={workflowId} setWorkflow={setWorkflow} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={deleteStep} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={savedWorkflows} messageTemplates={messageTemplates} scopeKey={scopeKey} onGuideStepChange={setGuideStep} />
      </div>
      <div id="workflow-review-section" className={`rounded-xl border p-3 text-sm ${reviewIssue ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
        <strong>{reviewIssue ? "Flow needs attention" : "Flow is ready"}</strong>
        <span className="ml-2">{reviewIssue || "Trigger, conditions and actions are valid."}</span>
      </div>
    </div>
  );
}
