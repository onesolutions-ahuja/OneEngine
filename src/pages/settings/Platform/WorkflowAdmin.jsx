import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api.js";
import PlatformFieldPicker from "./PlatformFieldPicker.jsx";
import MetadataResourcePicker from "./MetadataResourcePicker.jsx";

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

const WORKFLOW_VISUAL_CSS = `
  .workflow-builder-page {
    --wf-border: rgba(15, 23, 42, .09);
    --wf-muted: #64748b;
    --wf-text: #172033;
    --wf-blue: #0a84ff;
    --wf-surface: #ffffff;
    --wf-canvas: #fbfdff;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .workflow-builder-header {
    display: grid;
    grid-template-columns: auto minmax(180px, .95fr) minmax(170px, .8fr) minmax(150px, .72fr) auto;
    gap: 10px;
    align-items: end;
    padding: 12px;
    border: 1px solid var(--wf-border);
    border-radius: 14px;
    background: rgba(255,255,255,.98);
    box-shadow: 0 1px 3px rgba(15,23,42,.05);
  }
  .workflow-builder-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-right: 4px;
  }
  .workflow-builder-heading h2 {
    margin: 0;
    color: #13213a;
    font-size: 21px;
    line-height: 1.1;
    font-weight: 760;
    letter-spacing: -.025em;
    white-space: nowrap;
  }
  .workflow-builder-field label {
    display: block;
    margin: 0 0 5px;
    color: #64748b;
    font-size: 10px;
    font-weight: 650;
    letter-spacing: .015em;
    text-transform: none;
  }
  .workflow-builder-field input,
  .workflow-builder-field select {
    min-height: 38px;
  }
  .workflow-builder-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .workflow-save-button {
    min-height: 38px;
    border: 0;
    border-radius: 9px;
    padding: 0 16px;
    background: #0a84ff;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 5px 14px rgba(10,132,255,.18);
    cursor: pointer;
  }
  .workflow-cancel-button {
    min-height: 38px;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    padding: 0 11px;
    background: #fff;
    color: #64748b;
    font-size: 12px;
    cursor: pointer;
  }
  .workflow-ready-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #22c55e;
    box-shadow: 0 0 0 4px rgba(34,197,94,.10);
  }
  .workflow-ready-dot.has-issue {
    background: #ef4444;
    box-shadow: 0 0 0 4px rgba(239,68,68,.10);
  }

  .workflow-visual-shell {
    display: grid;
    grid-template-columns: 238px minmax(390px, 1fr) 336px;
    gap: 10px;
    min-height: calc(100vh - 198px);
    width: 100%;
    min-width: 0;
    align-items: stretch;
  }
  .workflow-node-palette,
  .workflow-properties-panel,
  .workflow-canvas-surface {
    min-width: 0;
    border: 1px solid var(--wf-border);
    border-radius: 14px;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15,23,42,.05);
  }
  .workflow-node-palette {
    padding: 12px 10px 10px;
    overflow: hidden;
  }
  .workflow-palette-head,
  .workflow-properties-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .workflow-properties-title,
  .workflow-palette-title {
    margin: 0;
    color: #172033;
    font-size: 14px;
    font-weight: 760;
  }
  .workflow-palette-search {
    position: relative;
    margin-bottom: 10px;
  }
  .workflow-palette-search span {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 13px;
    pointer-events: none;
  }
  .workflow-palette-search input {
    width: 100%;
    min-height: 37px;
    box-sizing: border-box;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    background: #fff;
    padding: 7px 9px 7px 30px;
    color: #334155;
    font: inherit;
    font-size: 12px;
    outline: none;
  }
  .workflow-palette-search input:focus {
    border-color: rgba(10,132,255,.45);
    box-shadow: 0 0 0 3px rgba(10,132,255,.08);
  }
  .workflow-palette-help {
    margin: -2px 0 9px;
    color: #94a3b8;
    font-size: 9px;
    line-height: 1.35;
  }
  .workflow-palette-scroll {
    max-height: calc(100vh - 330px);
    overflow: auto;
    padding-right: 3px;
  }
  .workflow-palette-empty {
    padding: 18px 8px;
    color: #94a3b8;
    font-size: 11px;
    text-align: center;
  }
  .workflow-palette-item {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    margin-bottom: 6px;
    padding: 7px 9px;
    border: 1px solid #e7edf4;
    border-radius: 9px;
    background: #fff;
    color: #334155;
    font-size: 11px;
    font-weight: 560;
    text-align: left;
    cursor: grab;
    transition: background .14s ease, border-color .14s ease, transform .14s ease, box-shadow .14s ease;
  }
  .workflow-palette-item::before {
    content: "⋮⋮";
    flex: 0 0 auto;
    color: #b1bdcc;
    font-size: 10px;
    letter-spacing: -2px;
  }
  .workflow-palette-item::after {
    content: "";
    order: -1;
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 2px;
    background: #0a84ff;
    box-shadow: 0 0 0 4px rgba(10,132,255,.08);
  }
  .workflow-palette-group-title {
    margin: 12px 4px 6px;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .workflow-palette-item-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .workflow-palette-item-copy strong {
    color: #334155;
    font-size: 11px;
    font-weight: 650;
  }
  .workflow-palette-item-copy small {
    display: block;
    overflow: hidden;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 450;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workflow-palette-item:hover {
    background: #f8fbff;
    border-color: rgba(10,132,255,.28);
    box-shadow: 0 4px 12px rgba(15,23,42,.05);
    transform: translateY(-1px);
  }

  .workflow-canvas-surface {
    position: relative;
    min-height: calc(100vh - 198px);
    max-height: calc(100vh - 156px);
    overflow: auto;
    padding: 16px 18px 30px;
    background-color: var(--wf-canvas);
    background-image: radial-gradient(circle, rgba(148,163,184,.30) 1px, transparent 1px);
    background-size: 18px 18px;
    box-shadow: inset 0 1px 4px rgba(15,23,42,.025);
  }
  .workflow-canvas-toolbar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    justify-content: flex-end;
    gap: 5px;
    margin: -5px -7px 14px;
    pointer-events: none;
  }
  .workflow-canvas-toolbar button {
    height: 30px;
    padding: 0 9px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: rgba(255,255,255,.94);
    color: #64748b;
    font-size: 10px;
    font-weight: 650;
    box-shadow: 0 2px 8px rgba(15,23,42,.05);
    cursor: pointer;
    pointer-events: auto;
  }
  .workflow-canvas-lane {
    width: min(100%, 560px);
    margin: 78px auto 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .workflow-start-node {
    display: grid;
    grid-template-columns: 34px 1fr;
    column-gap: 10px;
    align-items: center;
    min-width: 220px;
    max-width: 360px;
    border: 1.5px solid #50d68b;
    border-radius: 18px;
    background: linear-gradient(180deg,#f6fff9 0%,#effcf4 100%);
    padding: 10px 14px;
    color: #14532d;
    box-shadow: 0 8px 22px rgba(34,197,94,.08);
  }
  .workflow-start-icon {
    grid-row: 1 / 3;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: #22b95f;
    color: #fff;
    font-size: 14px;
    box-shadow: 0 4px 10px rgba(34,185,95,.20);
  }
  .workflow-start-title {
    color: #173c2a;
    font-size: 13px;
    font-weight: 760;
    line-height: 1.1;
  }
  .workflow-start-note {
    margin-top: 3px;
    color: #34a167;
    font-size: 10px;
    font-weight: 540;
  }
  .workflow-node-connector {
    position: relative;
    width: 2px;
    height: 42px;
    background: #93a7bf;
  }
  .workflow-node-connector::before {
    content: "";
    position: absolute;
    left: 50%;
    top: -3px;
    width: 8px;
    height: 8px;
    transform: translateX(-50%);
    border: 1.5px solid #7d93ad;
    border-radius: 999px;
    background: #fff;
  }
  .workflow-node-connector::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -1px;
    width: 7px;
    height: 7px;
    transform: translateX(-50%) rotate(45deg);
    border-right: 1.5px solid #7d93ad;
    border-bottom: 1.5px solid #7d93ad;
  }
  .workflow-node-wrap {
    position: relative;
    width: min(100%, 360px);
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .workflow-node-card {
    position: relative;
    width: 100%;
    min-height: 70px;
    padding: 12px 38px 12px 58px;
    border: 1px solid #dbe6f2;
    border-radius: 16px;
    background: rgba(255,255,255,.99);
    color: #1e293b;
    text-align: left;
    box-shadow: 0 8px 24px rgba(15,23,42,.055);
    cursor: pointer;
    transition: transform .14s ease, box-shadow .14s ease, border-color .14s ease;
  }
  .workflow-node-card::before {
    content: "◇";
    position: absolute;
    left: 13px;
    top: 50%;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    transform: translateY(-50%);
    border-radius: 9px;
    background: #0a84ff;
    color: #fff;
    font-size: 17px;
    font-weight: 800;
    box-shadow: 0 5px 12px rgba(10,132,255,.18);
  }
  .workflow-node-card:hover {
    transform: translateY(-1px);
    border-color: #9bbce0;
    box-shadow: 0 12px 27px rgba(15,23,42,.08);
  }
  .workflow-node-card.is-selected {
    border-color: #0a84ff;
    box-shadow: 0 0 0 2px rgba(10,132,255,.10), 0 12px 27px rgba(15,23,42,.08);
  }
  .workflow-node-card.is-disabled { opacity: .5; }
  .workflow-node-card.is-debug-completed {
    border-color: #22c55e;
    background: #f0fdf4;
    box-shadow: 0 0 0 2px rgba(34,197,94,.10), 0 10px 24px rgba(34,197,94,.08);
  }
  .workflow-node-card.is-debug-failed {
    border-color: #ef4444;
    background: #fff1f2;
    box-shadow: 0 0 0 3px rgba(239,68,68,.12), 0 12px 28px rgba(239,68,68,.12);
  }
  .workflow-node-card.is-debug-failed::before { background: #ef4444; }
  .workflow-node-card.is-debug-completed::before { background: #22c55e; }
  .workflow-node-card.is-debug-simulated {
    border-style: dashed;
  }
  .workflow-node-kind {
    display: block;
    margin-bottom: 4px;
    color: #7c8aa0;
    font-size: 8px;
    font-weight: 760;
    letter-spacing: .065em;
    text-transform: uppercase;
  }
  .workflow-node-title {
    display: block;
    color: #172033;
    font-size: 12px;
    font-weight: 760;
    line-height: 1.25;
  }
  .workflow-node-note {
    display: block;
    margin-top: 5px;
    color: #64748b;
    font-size: 9px;
  }
  .workflow-node-delete {
    position: absolute;
    top: 8px;
    right: 9px;
    z-index: 3;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #94a3b8;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .workflow-node-delete:hover {
    background: #fee2e2;
    color: #b91c1c;
  }

  .workflow-properties-panel {
    padding: 11px;
    overflow: auto;
    max-height: calc(100vh - 156px);
  }
  .workflow-properties-tabs {
    display: flex;
    gap: 22px;
    align-items: center;
    min-height: 32px;
    border-bottom: 1px solid #eef2f7;
    margin: -2px -2px 10px;
    padding: 0 7px;
  }
  .workflow-properties-tab {
    position: relative;
    padding: 0 0 9px;
    color: #64748b;
    font-size: 12px;
    font-weight: 650;
  }
  .workflow-properties-tab.is-active {
    color: #0a84ff;
  }
  .workflow-properties-tab.is-active::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    border-radius: 2px;
    background: #0a84ff;
  }
  .workflow-properties-panel > .rounded-xl {
    border: 0 !important;
    border-radius: 10px !important;
    padding: 4px !important;
    box-shadow: none !important;
  }
  .workflow-properties-panel label {
    text-transform: none !important;
    letter-spacing: 0 !important;
    color: #64748b !important;
    font-size: 10px !important;
    font-weight: 650 !important;
  }
  .workflow-properties-panel .space-y-3 > :not([hidden]) ~ :not([hidden]) {
    margin-top: .7rem;
  }
  .workflow-properties-panel .bg-slate-50 {
    background: #f8fafc !important;
  }
  .workflow-properties-panel .border-slate-200 {
    border-color: #e8edf3 !important;
  }
  .workflow-properties-panel textarea,
  .workflow-properties-panel input,
  .workflow-properties-panel select {
    font-size: 11px;
  }
  .workflow-properties-panel button {
    font-size: 10px;
  }
  .workflow-properties-panel .text-sm {
    font-size: 11px !important;
  }
  .workflow-properties-panel .text-xs {
    font-size: 9px !important;
  }

  .workflow-visual-shell.palette-collapsed {
    grid-template-columns: minmax(390px, 1fr) 336px;
  }
  .workflow-visual-shell.properties-collapsed {
    grid-template-columns: 238px minmax(390px, 1fr);
  }
  .workflow-visual-shell.palette-collapsed.properties-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .workflow-review-compact {
    display: none;
  }

  @media (max-width: 1350px) {
    .workflow-visual-shell {
      grid-template-columns: 210px minmax(360px, 1fr) 300px;
    }
    .workflow-visual-shell.palette-collapsed { grid-template-columns: minmax(360px, 1fr) 300px; }
    .workflow-visual-shell.properties-collapsed { grid-template-columns: 210px minmax(360px, 1fr); }
    .workflow-builder-header {
      grid-template-columns: auto minmax(170px, .9fr) minmax(160px, .75fr) minmax(145px, .7fr) auto;
    }
  }
  @media (max-width: 1050px) {
    .workflow-builder-header {
      grid-template-columns: 1fr 1fr;
    }
    .workflow-builder-heading {
      grid-column: 1 / -1;
    }
    .workflow-visual-shell {
      grid-template-columns: 200px minmax(0, 1fr);
    }
    .workflow-properties-panel {
      grid-column: 1 / -1;
      max-height: none;
    }
  }
  @media (max-width: 760px) {
    .workflow-builder-header,
    .workflow-visual-shell {
      grid-template-columns: 1fr;
    }
    .workflow-builder-actions {
      justify-content: stretch;
    }
    .workflow-save-button { flex: 1; }
    .workflow-node-palette,
    .workflow-properties-panel {
      max-height: 360px;
    }
    .workflow-canvas-surface {
      min-height: 560px;
    }
  }
`;

const actionOptions = [
  { value: "CONSTANT", label: "Constant" },
  { value: "FORMULA", label: "Formula" },
  { value: "ASSIGNMENT", label: "Assignment" },
  { value: "LOOP", label: "Loop" },
  { value: "SCHEDULE_PATH", label: "Scheduled Path" },
  { value: "GET_RECORDS", label: "Get Records" },
  { value: "BULK_UPDATE_RECORDS", label: "Bulk Update Records" },
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
  { value: "SEND_APPOINTMENT_CONFIRMATION", label: "Appointments - Send Booking Confirmation" },
  { value: "CALL_FUNCTION", label: "Call Function" },
  { value: "RUN_SUBFLOW", label: "Run Subflow" },
  { value: "WEBHOOK", label: "Webhook" },
  { value: "CONDITION", label: "Decision" },
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
      object: "",
      recordId: "",
      variableName: "",
      variableType: "text",
      operator: "set",
      value: "",
      resourceName: "",
      resourceType: "text",
      resultType: "number",
      expression: "",
      formulaInputs: {},
      collection: "",
      itemVariable: "currentItem",
      bodyBranch: [],
      recordIds: "",
      pathLabel: "Scheduled Path",
      scheduleMode: "OFFSET",
      delayAmount: 30,
      delayUnit: "MINUTES",
      runAt: "",
      branch: [],
      filters: [],
      match: "all",
      sortField: "",
      sortDirection: "asc",
      store: "first",
      limit: 1,
      fieldMappings: {},
      template: "",
      templateId: "",
      recipient: "customer.email",
      providerStatus: "not-configured",
      functionKey: "",
      inputs: { value: "hello" },
      workflowId: "",
      workflowInputs: {},
      condition: { type: "all", rules: [blankCondition()] },
      outcomes: [],
      defaultBranch: [],
      ifBranch: [],
      elseBranch: [],
      faultBranch: [],
      faultMode: "FAIL",
      retryCount: 1,
      durationSeconds: 60,
      reason: "",
      url: "",
      method: "POST",
      message: "",
      title: "",
      apiParameters: {},
    },
  };
}

function getActionLabel(type) {
  return actionOptions.find((option) => option.value === type)?.label || "Action";
}

function workflowActionCategory(type = "") {
  const key = String(type || "").toUpperCase();
  if (["CONSTANT","FORMULA"].includes(key)) return "Resources";
  if (["CONDITION","WAIT","STOP","ASSIGNMENT","LOOP","SCHEDULE_PATH"].includes(key)) return "Logic";
  if (key === "RUN_SUBFLOW") return "Workflows";
  if (["GET_RECORDS","BULK_UPDATE_RECORDS","CREATE_RECORD","UPDATE_RECORD","UPDATE_RELATED_RECORD","CREATE_RELATED_RECORD","DELETE_RECORD","ASSIGN_RECORD","ADD_RELATIONSHIP","REMOVE_RELATIONSHIP"].includes(key)) return "Data";
  if (["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP","IN_APP_NOTIFICATION","SEND_APPOINTMENT_CONFIRMATION"].includes(key)) return "Communication";
  if (key === "CALL_FUNCTION") return "Advanced";
  if (key.includes("WEBHOOK") || key === "HTTP_REQUEST" || key.startsWith("CONNECTOR_")) return "Integrations";
  if (key.startsWith("PAYMENT_") || key.startsWith("PRINT_") || key.includes("SCANNER") || key.includes("CASH_DRAWER")) return "Hardware & Payments";
  if (key.startsWith("QUICKBOOKS_") || key.startsWith("SHOPIFY_") || key.startsWith("UBER_")) return "Connected Apps";
  if (key.includes("APPOINTMENT")) return "Appointments";
  return "App Actions";
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
    if (["is_empty","is_not_empty","changed"].includes(operator)) return true;
    if (operator === "changed_from_to") {
      return rule.value && typeof rule.value === "object"
        && rule.value.from !== undefined && rule.value.from !== null && String(rule.value.from).trim() !== ""
        && rule.value.to !== undefined && rule.value.to !== null && String(rule.value.to).trim() !== "";
    }
    return rule.value !== undefined && rule.value !== null && String(rule.value).trim() !== "";
  });
}

function workflowActionIssue(step, definition = null) {
  if (!step || step.enabled === false) return "";
  const config = step.config || {};
  const required = Array.isArray(definition?.schema?.required) ? definition.schema.required : [];
  for (const key of required) {
    const value = config[key] ?? config.apiParameters?.[key];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
      const label = String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
      return `Complete required field: ${label}.`;
    }
  }
  if (step.type === "CONSTANT") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid constant name.";
    if (!config.resourceType) return "Choose a constant type.";
    if (config.value === undefined || config.value === "") return "Enter the constant value.";
  }
  if (step.type === "FORMULA") {
    if (!config.resourceName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.resourceName))) return "Enter a valid formula name.";
    if (!config.resultType) return "Choose a formula result type.";
    if (!String(config.expression || "").trim()) return "Enter a formula expression.";
    if (!config.formulaInputs || !Object.keys(config.formulaInputs).length) return "Add at least one formula input.";
    if (Object.keys(config.formulaInputs).some((name) => !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(name)))) return "Formula input names can only use letters, numbers and underscores.";
  }
  if (step.type === "LOOP") {
    if (!config.collection) return "Choose the collection to loop through.";
    if (!config.itemVariable || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.itemVariable))) return "Enter a valid Current Item variable name.";
    if (!Array.isArray(config.bodyBranch) || !config.bodyBranch.length) return "Choose at least one step for the Loop body.";
  }
  if (step.type === "BULK_UPDATE_RECORDS") {
    if (!config.object) return "Choose the target object.";
    if (!config.recordIds) return "Choose the record collection.";
    if (!config.fieldMappings || !Object.keys(config.fieldMappings).length) return "Map at least one field to update.";
  }
  if (step.type === "ASSIGNMENT") {
    if (!config.variableName || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(config.variableName))) return "Enter a valid variable name.";
    if (!config.variableType) return "Choose a variable type.";
    if (!config.operator) return "Choose an assignment operation.";
  }
  if (step.type === "CONDITION") {
    const outcomes = Array.isArray(config.outcomes) ? config.outcomes : [];
    if (outcomes.length) {
      if (outcomes.some((outcome) => !String(outcome?.label || "").trim())) return "Name every Decision outcome.";
      if (outcomes.some((outcome) => !conditionIsValid(outcome?.condition))) return "Complete every Decision outcome condition.";
      const ids = outcomes.map((outcome) => String(outcome?.id || ""));
      if (new Set(ids).size !== ids.length) return "Decision outcome identifiers must be unique.";
      const seenTargets = new Set();
      for (const outcome of outcomes) {
        for (const targetId of outcome?.branch || []) {
          if (seenTargets.has(String(targetId))) return "A step can only belong to one Decision outcome.";
          seenTargets.add(String(targetId));
        }
      }
      for (const targetId of config.defaultBranch || []) {
        if (seenTargets.has(String(targetId))) return "A step cannot belong to both an outcome and Default.";
        seenTargets.add(String(targetId));
      }
      return "";
    }
    return conditionIsValid(config.condition) ? "" : "Complete the condition field/operator/value.";
  }
  if ((RECORD_ACTION_TYPES.has(step.type) || step.type === "GET_RECORDS") && !config.object) return "Choose the target object.";
  if (["SEND_EMAIL","SEND_SMS","SEND_WHATSAPP"].includes(step.type)) {
    if (!config.templateId && !config.template) return "Choose a message template.";
    if (!config.recipient) return "Choose a recipient.";
  }
  if (step.type === "IN_APP_NOTIFICATION" && (!config.title || !config.message || !config.recipient)) {
    return "Add title, message and recipient.";
  }
  if (step.type === "CALL_FUNCTION" && !config.functionKey) return "Choose a registered function.";
  if (step.type === "RUN_SUBFLOW" && !config.workflowId) return "Choose a subflow.";
  if (["WEBHOOK","CALL_WEBHOOK","HTTP_REQUEST"].includes(step.type) && !config.url && !config.endpoint) return "Enter the request URL.";
  if (step.type === "SCHEDULE_PATH") {
    if (!String(config.pathLabel || "").trim()) return "Name the Scheduled Path.";
    if (!Array.isArray(config.branch) || !config.branch.length) return "Choose at least one step for the Scheduled Path.";
    if ((config.scheduleMode || "OFFSET") === "OFFSET" && (!Number.isFinite(Number(config.delayAmount)) || Number(config.delayAmount) < 0)) return "Enter a valid Scheduled Path delay.";
    if ((config.scheduleMode || "OFFSET") === "AT_DATETIME" && !config.runAt) return "Choose the Scheduled Path date/time Resource.";
  }
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

function StepConditionEditor({ value, onChange, objectKey, extraResources = [] }) {
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
            <option value="greater_than_or_equal">Greater than or equal</option>
            <option value="less_than">Less than</option>
            <option value="less_than_or_equal">Less than or equal</option>
            <option value="changed">Changed</option>
            <option value="changed_from">Changed from</option>
            <option value="changed_to">Changed to</option>
            <option value="changed_from_to">Changed from/to</option>
            <option value="is_empty">Is empty</option>
            <option value="is_not_empty">Is not empty</option>
          </select>
          {["is_empty","is_not_empty","changed"].includes(rule.operator) ? <div /> : rule.operator === "changed_from_to" ? (
            <div className="grid gap-2">
              <ResourceOrLiteralInput label="From" value={rule.value?.from ?? ""} onChange={(from) => {
                const next = [...(config.rules || [])];
                next[index] = { ...rule, value: { ...(rule.value && typeof rule.value === "object" ? rule.value : {}), from } };
                update({ rules: next });
              }} rootObjectKey={objectKey} extraResources={extraResources} />
              <ResourceOrLiteralInput label="To" value={rule.value?.to ?? ""} onChange={(to) => {
                const next = [...(config.rules || [])];
                next[index] = { ...rule, value: { ...(rule.value && typeof rule.value === "object" ? rule.value : {}), to } };
                update({ rules: next });
              }} rootObjectKey={objectKey} extraResources={extraResources} />
            </div>
          ) : (
            <ResourceOrLiteralInput label="Value" value={rule.value ?? ""} onChange={(value) => {
              const next = [...(config.rules || [])];
              next[index] = { ...rule, value };
              update({ rules: next });
            }} rootObjectKey={objectKey} extraResources={extraResources} />
          )}
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

function MappingEditor({ value = {}, onChange, rootObjectKey, extraResources = [], keyLabel = "Input", valueLabel = "Value" }) {
  const entries = Object.entries(value || {});
  const setEntry = (index, nextKey, nextValue) => {
    const next = {};
    entries.forEach(([key, currentValue], itemIndex) => {
      if (itemIndex === index) {
        if (nextKey) next[nextKey] = nextValue;
      } else if (key) next[key] = currentValue;
    });
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {entries.map(([key, currentValue], index) => (
        <div key={`${key}-${index}`} className="grid gap-2 md:grid-cols-[0.8fr_1.2fr_auto]">
          <input className={inputClass} value={key} onChange={(event) => setEntry(index, event.target.value, currentValue)} placeholder={keyLabel} />
          <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label={valueLabel} value={String(currentValue ?? "")} onChange={(nextValue) => setEntry(index, key, nextValue)} />
          <button type="button" className="rounded border border-slate-200 px-2 text-xs text-red-600" onClick={() => {
            const next = Object.fromEntries(entries.filter((_, itemIndex) => itemIndex !== index));
            onChange(next);
          }}>Remove</button>
        </div>
      ))}
      <button type="button" className="text-sm text-blue-700" onClick={() => onChange({ ...(value || {}), [`input_${entries.length + 1}`]: "" })}>+ Add mapping</button>
    </div>
  );
}

function workflowStepResources(steps = [], currentIndex = 0, objectFieldCatalog = {}) {
  const resources = [
    { value: "variables.fault.message", label: "Fault → Error message", type: "fault" },
    { value: "variables.fault.title", label: "Fault → Problem", type: "fault" },
    { value: "variables.fault.howToFix", label: "Fault → How to fix", type: "fault" },
    { value: "variables.fault.actionType", label: "Fault → Failed action type", type: "fault" },
  ];
  const seenVariables = new Set();
  steps.slice(0, currentIndex).forEach((step, index) => {
    const label = step.label || getActionLabel(step.type) || `Step ${index + 1}`;
    const prefix = `steps.${step.id}`;
    if (step.type === "CONSTANT" && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · Constant · ${step.config.resourceType || "text"}`,
          type: step.config.resourceType || "constant",
        });
        seenVariables.add(step.config.resourceName);
      }
      resources.push({ value: `${prefix}.value`, label: `${label} → Value`, type: step.config.resourceType || "step output" });
    } else if (step.type === "FORMULA" && step.config?.resourceName) {
      if (!seenVariables.has(step.config.resourceName)) {
        resources.push({
          value: `variables.${step.config.resourceName}`,
          label: `${step.config.resourceName} · Formula · ${step.config.resultType || "number"}`,
          type: step.config.resultType || "formula",
        });
        seenVariables.add(step.config.resourceName);
      }
      resources.push({ value: `${prefix}.value`, label: `${label} → Result`, type: step.config.resultType || "step output" });
    } else if (step.type === "ASSIGNMENT" && step.config?.variableName) {
      if (!seenVariables.has(step.config.variableName)) {
        resources.push({
          value: `variables.${step.config.variableName}`,
          label: `${step.config.variableName} · ${step.config.variableType || "text"}`,
          type: step.config.variableType || "variable",
        });
        seenVariables.add(step.config.variableName);
      }
      resources.push({
        value: `${prefix}.value`,
        label: `${label} → Assigned Value`,
        type: step.config.variableType || "step output",
      });
    } else if (step.type === "LOOP" && step.config?.itemVariable) {
      resources.push(
        {
          value: `variables.${step.config.itemVariable}`,
          label: `${step.config.itemVariable} · Current Loop Item`,
          type: "record",
        },
        {
          value: `variables.${step.config.itemVariable}.id`,
          label: `${step.config.itemVariable} → Record ID`,
          type: "record id",
        },
        { value: `${prefix}.count`, label: `${label} → Iteration Count`, type: "number" },
      );
    } else if (step.type === "GET_RECORDS") {
      resources.push(
        { value: `${prefix}.record.id`, label: `${label} → First Record → Record ID`, type: "record id" },
        { value: `${prefix}.count`, label: `${label} → Record Count`, type: "number" },
        { value: `${prefix}.records`, label: `${label} → All Records`, type: "collection" },
      );
      for (const field of objectFieldCatalog?.[step.config?.object] || []) {
        if (!field?.apiName) continue;
        resources.push({
          value: `${prefix}.record.${field.apiName}`,
          label: `${label} → First Record → ${field.label || field.apiName}`,
          type: field.type || "field",
        });
      }
    } else if (step.type === "CREATE_RECORD") {
      resources.push({ value: `${prefix}.created.id`, label: `${label} → Created Record ID`, type: "step output" });
    } else if (step.type === "UPDATE_RECORD") {
      resources.push({ value: `${prefix}.updated.id`, label: `${label} → Updated Record ID`, type: "step output" });
    } else if (step.type === "RUN_SUBFLOW") {
      resources.push({ value: `${prefix}.runId`, label: `${label} → Child Run ID`, type: "step output" });
      for (const output of step.config?.declaredOutputs || []) {
        if (!output?.name) continue;
        resources.push({ value: `${prefix}.outputs.${output.name}`, label: `${label} → ${output.label || output.name}`, type: output.type || "subflow output" });
      }
    }
  });
  return resources;
}

function looksLikeWorkflowResource(value = "") {
  const text = String(value || "");
  return text.startsWith("$") || text.startsWith("steps.") || text.startsWith("variables.");
}

function ResourceOrLiteralInput({ label, value, onChange, rootObjectKey, extraResources = [], type = "string", required = false, allowResource = true }) {
  const [mode, setMode] = useState(() => looksLikeWorkflowResource(value) ? "resource" : "value");
  const numeric = type === "number" || type === "integer";
  const boolean = type === "boolean";
  const dateType = type === "date" ? "date" : type === "datetime" ? "datetime-local" : (numeric ? "number" : "text");
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-slate-600">{label}{required ? " *" : ""}</label>
        {allowResource ? <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
          <button type="button" className={`rounded px-2 py-1 text-[10px] ${mode === "value" ? "bg-slate-100 text-slate-800" : "text-slate-500"}`} onClick={() => setMode("value")}>Value</button>
          <button type="button" className={`rounded px-2 py-1 text-[10px] ${mode === "resource" ? "bg-blue-50 text-blue-700" : "text-slate-500"}`} onClick={() => setMode("resource")}>Resource</button>
        </div> : null}
      </div>
      {allowResource && mode === "resource" ? (
        <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="" value={String(value ?? "")} onChange={onChange} />
      ) : boolean ? (
        <select className={inputClass} value={value === true ? "true" : value === false ? "false" : ""} onChange={(event) => onChange(event.target.value === "" ? "" : event.target.value === "true")}>
          <option value="">Select value</option>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : (
        <input
          className={inputClass}
          type={dateType}
          value={value ?? ""}
          onChange={(event) => onChange(numeric ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)}
        />
      )}
    </div>
  );
}

function SchemaActionEditor({ definition, config = {}, onChange, rootObjectKey, extraResources = [] }) {
  const schema = definition?.schema;
  const properties = schema?.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  const entries = Object.entries(properties);
  if (!schema || schema.type !== "object" || !entries.length) {
    const hiddenKeys = new Set([
      "object","recordId","filters","match","sortField","sortDirection","store","limit",
      "fieldMappings","fieldValues","template","templateId","recipient","providerStatus",
      "functionKey","inputs","workflowId","workflowInputs","condition","ifBranch","elseBranch",
      "durationSeconds","resumeAt","reason","url","method","message","title","apiParameters"
    ]);
    const existingParameters = Object.fromEntries(Object.entries(config || {}).filter(([key, value]) => {
      if (hiddenKeys.has(key)) return false;
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && !value.length) return false;
      if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return false;
      return true;
    }));
    const parameterValues = { ...existingParameters, ...(config.apiParameters || {}) };
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <strong className="text-xs text-slate-700">{definition?.label || definition?.value || "Registered action"}</strong>
          {definition?.description ? <p className="mt-1 text-xs text-slate-500">{definition.description}</p> : null}
          <p className="mt-2 text-[11px] text-slate-500">This action is available through the workflow API but does not publish a field schema yet. Configure the same request parameters here without writing JSON.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Action parameters</label>
          <MappingEditor
            value={parameterValues}
            onChange={(apiParameters) => onChange({ apiParameters })}
            rootObjectKey={rootObjectKey}
            extraResources={extraResources}
            keyLabel="API parameter"
            valueLabel="Value / resource"
          />
        </div>
      </div>
    );
  }

  const patch = (key, value) => onChange({ [key]: value });
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <strong className="text-xs text-slate-700">{definition.label || definition.value}</strong>
        {definition.description ? <p className="mt-1 text-xs text-slate-500">{definition.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {definition.capability ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-700">Capability: {definition.capability}</span> : null}
          {(definition.requiredPermissions || []).map((permission) => <span key={permission} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-600">{permission}</span>)}
          {definition.requiredEntitlement ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">Licence: {definition.requiredEntitlement}</span> : null}
        </div>
      </div>
      {entries.map(([key, property]) => {
        const fieldLabel = property.title || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
        const value = config?.[key];
        if (Array.isArray(property.enum)) {
          return (
            <label key={key} className="block space-y-1 text-xs font-medium text-slate-600">
              <span>{fieldLabel}{required.has(key) ? " *" : ""}</span>
              <select className={inputClass} value={value ?? ""} onChange={(event) => patch(key, event.target.value)}>
                <option value="">Select {fieldLabel.toLowerCase()}</option>
                {property.enum.map((option) => <option key={String(option)} value={option}>{String(option).replace(/_/g, " ")}</option>)}
              </select>
            </label>
          );
        }
        if (property.type === "boolean") {
          return (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              <input type="checkbox" checked={value === true} onChange={(event) => patch(key, event.target.checked)} />
              <span>{fieldLabel}{required.has(key) ? " *" : ""}</span>
            </label>
          );
        }
        if (property.type === "object") {
          return (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{fieldLabel}{required.has(key) ? " *" : ""}</label>
              <MappingEditor value={value && typeof value === "object" && !Array.isArray(value) ? value : {}} onChange={(next) => patch(key, next)} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Key" valueLabel="Value / resource" />
            </div>
          );
        }
        if (property.type === "array") {
          const values = Array.isArray(value) ? value : [];
          return (
            <div key={key} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-600">{fieldLabel}{required.has(key) ? " *" : ""}</div>
              {values.map((item, itemIndex) => (
                <div key={itemIndex} className="grid grid-cols-[1fr_auto] gap-2">
                  <ResourceOrLiteralInput label={`Item ${itemIndex + 1}`} value={item} onChange={(nextValue) => {
                    const next = [...values]; next[itemIndex] = nextValue; patch(key, next);
                  }} rootObjectKey={rootObjectKey} extraResources={extraResources} type={property.items?.type || "string"} />
                  <button type="button" className="self-end rounded border border-slate-200 px-2 py-2 text-xs text-red-600" onClick={() => patch(key, values.filter((_, index) => index !== itemIndex))}>Remove</button>
                </div>
              ))}
              <button type="button" className="text-sm text-blue-700" onClick={() => patch(key, [...values, ""])}>+ Add item</button>
            </div>
          );
        }
        return (
          <ResourceOrLiteralInput key={key} label={fieldLabel} value={value} onChange={(next) => patch(key, next)} rootObjectKey={rootObjectKey} extraResources={extraResources} type={property.type || "string"} required={required.has(key)} />
        );
      })}
    </div>
  );
}

function BranchStepPicker({ label, value = [], onChange, steps = [], currentIndex }) {
  const candidates = steps
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ index }) => index > currentIndex);
  const selected = new Set(value || []);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-xs font-semibold text-slate-700">{label}</div>
      {!candidates.length ? <p className="text-xs text-slate-500">Add a later action, then assign it to this path.</p> : null}
      <div className="space-y-1">
        {candidates.map(({ candidate, index }) => (
          <label key={candidate.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-white">
            <input
              type="checkbox"
              checked={selected.has(candidate.id)}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(candidate.id); else next.delete(candidate.id);
                onChange([...next]);
              }}
            />
            <span>{index + 1}. {candidate.label || getActionLabel(candidate.type)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function StepEditor({ step, index, allSteps = [], updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], rootObjectKey, scopeKey = null, debugInfo = null, objectFieldCatalog = {} }) {
  const updateConfig = (patch) => updateStep(index, { config: { ...(step.config || {}), ...patch } });
  const extraResources = workflowStepResources(allSteps, index, objectFieldCatalog);
  const registryDefinition = registryOptions.find((option) => option.value === step.type) || null;
  const updateFieldMapping = (key, value) => {
    const fieldMappings = { ...(step.config?.fieldMappings || {}) };
    fieldMappings[key] = value;
    updateConfig({ fieldMappings });
  };

  const renderConfig = () => {
    switch (step.type) {
      case "CONSTANT":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Constant name</label>
              <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. vatRate" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Type</label>
              <select className={inputClass} value={step.config?.resourceType || "text"} onChange={(event) => updateConfig({ resourceType: event.target.value, value: "" })}>
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="date">Date</option>
                <option value="datetime">Date / Time</option>
              </select>
            </div>
            <ResourceOrLiteralInput label="Fixed value" value={step.config?.value ?? ""} onChange={(value) => updateConfig({ value })} rootObjectKey={rootObjectKey} extraResources={[]} type={step.config?.resourceType || "text"} required allowResource={false} />
            <p className="text-[11px] text-slate-500">Constants are fixed for this workflow run and are exposed to later steps as Resources.</p>
          </div>
        );
      case "FORMULA":
        return (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Formula name</label>
                <input className={inputClass} value={step.config?.resourceName || ""} onChange={(event) => updateConfig({ resourceName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} placeholder="e.g. totalWithTax" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Result type</label>
                <select className={inputClass} value={step.config?.resultType || "number"} onChange={(event) => updateConfig({ resultType: event.target.value })}>
                  <option value="number">Number</option>
                  <option value="text">Text</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="datetime">Date / Time</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Named inputs</label>
              <MappingEditor value={step.config?.formulaInputs || {}} onChange={(formulaInputs) => updateConfig({ formulaInputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Formula name" valueLabel="Map from resource" />
              <p className="mt-1 text-[11px] text-slate-500">Use simple names such as amount, tax or customerCount. Those names are what you use in the formula below.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Formula</label>
              <textarea className={inputClass} rows={4} value={step.config?.expression || ""} onChange={(event) => updateConfig({ expression: event.target.value })} placeholder="amount + tax" />
              <p className="mt-1 text-[11px] text-slate-500">Supported: + - * / %, comparisons, && / ||, IF, COALESCE, CONCAT, ROUND, ABS, MIN and MAX. JavaScript is never executed.</p>
            </div>
          </div>
        );
      case "LOOP":
        return (
          <div className="space-y-3">
            <MetadataResourcePicker
              objectKey={rootObjectKey}
              extraResources={extraResources.filter((resource) => resource.type === "collection" || String(resource.value || "").endsWith(".records") || String(resource.value || "").startsWith("variables."))}
              label="Collection"
              value={step.config?.collection || ""}
              onChange={(collection) => updateConfig({ collection })}
            />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Current Item variable</label>
              <input className={inputClass} value={step.config?.itemVariable || "currentItem"} onChange={(event) => updateConfig({ itemVariable: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
              <p className="mt-1 text-[11px] text-slate-500">Steps inside the Loop can use this Resource to access the item being processed.</p>
            </div>
            <BranchStepPicker label="Loop body steps" value={step.config?.bodyBranch || []} onChange={(bodyBranch) => updateConfig({ bodyBranch })} steps={allSteps} currentIndex={index} />
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Loop bodies support durable Wait. Completed iterations replay idempotently after resume, so already-finished side effects are not repeated.
            </div>
          </div>
        );
      case "BULK_UPDATE_RECORDS":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Object</label>
              <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly selectedObjectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, fieldMappings: {} })} />
            </div>
            <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Record collection" value={step.config?.recordIds || ""} onChange={(recordIds) => updateConfig({ recordIds })} />
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field updates</label>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {Object.entries(step.config?.fieldMappings || {}).map(([key, value], mappingIndex) => (
                  <div className="grid gap-2 md:grid-cols-2" key={`${key}-${mappingIndex}`}>
                    <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={key} label="Target field" onChange={(field) => {
                      const next = { ...(step.config?.fieldMappings || {}) };
                      const currentValue = next[key];
                      delete next[key];
                      next[field] = currentValue;
                      updateConfig({ fieldMappings: next });
                    }} />
                    <ResourceOrLiteralInput label="New value" value={value} onChange={(source) => updateFieldMapping(key, source)} rootObjectKey={rootObjectKey} extraResources={extraResources} />
                  </div>
                ))}
                <button type="button" className="text-sm text-blue-700" onClick={() => {
                  const next = { ...(step.config?.fieldMappings || {}) };
                  let key = `field_${Object.keys(next).length + 1}`;
                  while (Object.prototype.hasOwnProperty.call(next, key)) key += "_";
                  next[key] = "";
                  updateConfig({ fieldMappings: next });
                }}>+ Add field</button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">All selected records are updated in one scoped database operation rather than one update per Loop iteration.</p>
          </div>
        );
      case "ASSIGNMENT":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Variable name</label>
              <input
                className={inputClass}
                value={step.config?.variableName || ""}
                onChange={(event) => updateConfig({ variableName: event.target.value.replace(/[^A-Za-z0-9_]/g, "") })}
                placeholder="e.g. followUpDate"
              />
              <p className="mt-1 text-[11px] text-slate-500">This becomes available to later steps as a Resource.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Type</label>
                <select className={inputClass} value={step.config?.variableType || "text"} onChange={(event) => updateConfig({ variableType: event.target.value, operator: "set", value: "" })}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="date">Date</option>
                  <option value="datetime">Date / Time</option>
                  <option value="record">Record</option>
                  <option value="collection">Collection</option>
                  <option value="object">Object</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Operation</label>
                <select className={inputClass} value={step.config?.operator || "set"} onChange={(event) => updateConfig({ operator: event.target.value })}>
                  <option value="set">Set value</option>
                  {step.config?.variableType === "number" ? <option value="add">Add</option> : null}
                  {step.config?.variableType === "number" ? <option value="subtract">Subtract</option> : null}
                  {step.config?.variableType === "collection" ? <option value="append">Append to collection</option> : null}
                </select>
              </div>
            </div>
            <ResourceOrLiteralInput
              label="Value"
              value={step.config?.value ?? ""}
              onChange={(value) => updateConfig({ value })}
              rootObjectKey={rootObjectKey}
              extraResources={extraResources}
              type={step.config?.variableType || "string"}
              required
            />
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Later steps will find this under Resources as <strong>{step.config?.variableName ? `variables.${step.config.variableName}` : "your variable"}</strong>.
            </div>
          </div>
        );
      case "GET_RECORDS": {
        const filters = Array.isArray(step.config?.filters) ? step.config.filters : [];
        const updateFilter = (filterIndex, patch) => {
          const next = [...filters];
          next[filterIndex] = { ...next[filterIndex], ...patch };
          updateConfig({ filters: next });
        };
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Object</label>
              <PlatformFieldPicker scopeKey={scopeKey} includeObjectSelector objectOnly selectedObjectKey={step.config?.object || ""} onObjectChange={(object) => updateConfig({ object, filters: [], sortField: "" })} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-700">Filter conditions</strong>
                <select className={inputClass} value={step.config?.match || "all"} onChange={(event) => updateConfig({ match: event.target.value })}>
                  <option value="all">Match ALL</option>
                  <option value="any">Match ANY</option>
                </select>
              </div>
              <div className="space-y-2">
                {filters.map((filter, filterIndex) => (
                  <div key={filter.id || filterIndex} className="grid gap-2 md:grid-cols-[1.1fr_.8fr_1fr_auto]">
                    <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={filter.field || ""} label="Field" onChange={(field) => updateFilter(filterIndex, { field })} />
                    <select className={inputClass} value={filter.operator || "equals"} onChange={(event) => updateFilter(filterIndex, { operator: event.target.value })}>
                      <option value="equals">Equals</option>
                      <option value="not_equals">Not equal</option>
                      <option value="greater_than">Greater than</option>
                      <option value="greater_than_or_equal">Greater than or equal</option>
                      <option value="less_than">Less than</option>
                      <option value="less_than_or_equal">Less than or equal</option>
                      <option value="contains">Contains</option>
                      <option value="is_empty">Is empty</option>
                      <option value="is_not_empty">Is not empty</option>
                    </select>
                    {["is_empty","is_not_empty"].includes(filter.operator) ? <div /> : (
                      <ResourceOrLiteralInput
                        label=""
                        value={filter.value ?? ""}
                        onChange={(value) => updateFilter(filterIndex, { value })}
                        rootObjectKey={rootObjectKey}
                        extraResources={extraResources}
                      />
                    )}
                    <button type="button" className="rounded border border-slate-200 px-2 text-xs text-red-600" onClick={() => updateConfig({ filters: filters.filter((_, itemIndex) => itemIndex !== filterIndex) })}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" className="mt-2 text-sm text-blue-700" onClick={() => updateConfig({ filters: [...filters, { id: `filter-${Date.now()}`, field: "", operator: "equals", value: "" }] })}>+ Add filter</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Sort by</label>
                <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={step.config?.sortField || ""} label="Optional sort field" onChange={(sortField) => updateConfig({ sortField })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Direction</label>
                <select className={inputClass} value={step.config?.sortDirection || "asc"} onChange={(event) => updateConfig({ sortDirection: event.target.value })}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Store result</label>
                <select className={inputClass} value={step.config?.store || "first"} onChange={(event) => updateConfig({ store: event.target.value, limit: event.target.value === "first" ? 1 : Math.max(Number(step.config?.limit || 50), 2) })}>
                  <option value="first">First matching record</option>
                  <option value="all">All matching records</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Maximum records</label>
                <input className={inputClass} type="number" min="1" max="200" disabled={(step.config?.store || "first") === "first"} value={(step.config?.store || "first") === "first" ? 1 : Number(step.config?.limit || 50)} onChange={(event) => updateConfig({ limit: Math.max(1, Math.min(200, Number(event.target.value || 1))) })} />
              </div>
            </div>
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Later steps can use this element from the Resource picker, including its first Record ID, record count, or collection.
            </div>
          </div>
        );
      }
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
                <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Record / related record" value={step.config?.recordId || ""} onChange={(recordId) => updateConfig({ recordId })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Field mappings</label>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {Object.entries(step.config?.fieldMappings || {}).map(([key, value], mappingIndex) => (
                  <div className="grid gap-2 md:grid-cols-2" key={`${key}-${mappingIndex}`}>
                    <PlatformFieldPicker scopeKey={scopeKey} selectedObjectKey={step.config?.object || ""} value={key} label="Target field" onChange={(field) => {
                      const next = { ...(step.config?.fieldMappings || {}) };
                      const currentValue = next[key];
                      delete next[key];
                      next[field] = currentValue;
                      updateConfig({ fieldMappings: next });
                    }} />
                    <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Source value" value={value} onChange={(source) => updateFieldMapping(key, source)} />
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
      case "SEND_APPOINTMENT_CONFIRMATION":
        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <strong className="text-sm text-slate-700">Booking confirmation</strong>
              <p className="mt-1 text-xs text-slate-500">Sent through the same mobile channel used to book. Leave Recipient blank to reply to the booking customer.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Confirmation message</label>
              <textarea
                className={inputClass}
                value={step.config?.message || ""}
                onChange={(event) => updateConfig({ message: event.target.value })}
                rows={4}
                placeholder="Your {{serviceName}} appointment is booked for {{startsAt}}."
              />
              <p className="mt-1 text-xs text-slate-500">Available values: {"{{serviceName}}"}, {"{{startsAt}}"}, {"{{appointmentId}}"}. If left blank, OneAssistant uses its standard confirmation message.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Recipient override</label>
              <input
                className={inputClass}
                value={step.config?.recipient || ""}
                onChange={(event) => updateConfig({ recipient: event.target.value })}
                placeholder="Leave blank to use the booking customer's phone"
              />
            </div>
          </div>
        );
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
              <MappingEditor value={step.config?.inputs || {}} onChange={(inputs) => updateConfig({ inputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Input name" valueLabel="Input value" />
            </div>
          </div>
        );
      case "RUN_SUBFLOW": {
        const selectedSubflow = availableWorkflows.find((item) => String(item.id) === String(step.config?.workflowId || ""));
        const inputContract = Array.isArray(selectedSubflow?.inputContract) ? selectedSubflow.inputContract : [];
        const outputContract = Array.isArray(selectedSubflow?.outputContract) ? selectedSubflow.outputContract : [];
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Workflow</label>
              <select className={inputClass} value={step.config?.workflowId || ""} onChange={(event) => {
                const selected = availableWorkflows.find((item) => String(item.id) === String(event.target.value));
                updateConfig({ workflowId: event.target.value, workflowInputs: {}, declaredOutputs: selected?.outputContract || [] });
              }}>
                <option value="">Select a saved workflow</option>
                {step.config?.workflowId && !availableWorkflows.some((item) => String(item.id) === String(step.config.workflowId)) ? <option value={step.config.workflowId} disabled>{step.config.workflowId} (unavailable)</option> : null}
                {availableWorkflows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {!availableWorkflows.length ? <p className="text-xs text-slate-500">Save another active workflow before selecting a subflow.</p> : null}
            </div>
            {inputContract.length ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Declared inputs</div>
                {inputContract.map((input) => (
                  <ResourceOrLiteralInput
                    key={input.name}
                    label={`${input.label || input.name}${input.required ? " *" : ""}`}
                    value={step.config?.workflowInputs?.[input.name] ?? ""}
                    onChange={(value) => updateConfig({ workflowInputs: { ...(step.config?.workflowInputs || {}), [input.name]: value } })}
                    rootObjectKey={rootObjectKey}
                    extraResources={extraResources}
                    type={input.type || "string"}
                    required={input.required === true}
                  />
                ))}
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Input mapping</label>
                <MappingEditor value={step.config?.workflowInputs || {}} onChange={(workflowInputs) => updateConfig({ workflowInputs })} rootObjectKey={rootObjectKey} extraResources={extraResources} keyLabel="Subflow input" valueLabel="Map from resource" />
                <p className="mt-1 text-[11px] text-slate-500">This workflow has no formal input contract yet, so legacy free-form mapping remains available.</p>
              </div>
            )}
            {outputContract.length ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="text-xs font-semibold text-blue-800">Outputs available after this step</div>
                <div className="mt-2 space-y-1 text-[11px] text-blue-700">
                  {outputContract.map((output) => <div key={output.name}>{output.label || output.name} · {output.type || "text"}</div>)}
                </div>
              </div>
            ) : null}
          </div>
        );
      }
      case "CONDITION": {
        const configuredOutcomes = Array.isArray(step.config?.outcomes) ? step.config.outcomes : [];
        const outcomes = configuredOutcomes.length
          ? configuredOutcomes
          : [{
              id: "outcome-1",
              label: "Outcome 1",
              condition: step.config?.condition || { type: "all", rules: [blankCondition()] },
              branch: step.config?.ifBranch || [],
            }];
        const defaultBranch = configuredOutcomes.length ? (step.config?.defaultBranch || []) : (step.config?.elseBranch || []);
        const setOutcomes = (nextOutcomes) => updateConfig({ outcomes: nextOutcomes, defaultBranch, condition: null, ifBranch: [], elseBranch: [] });
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              Outcomes are checked from top to bottom. The first matching outcome runs; if none match, the Default path runs.
            </div>
            {outcomes.map((outcome, outcomeIndex) => (
              <div key={outcome.id || outcomeIndex} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={outcome.label || ""}
                    onChange={(event) => {
                      const next = [...outcomes];
                      next[outcomeIndex] = { ...outcome, label: event.target.value };
                      setOutcomes(next);
                    }}
                    placeholder={`Outcome ${outcomeIndex + 1}`}
                  />
                  <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-slate-600" disabled={outcomeIndex === 0} onClick={() => {
                    if (outcomeIndex === 0) return;
                    const next = [...outcomes];
                    [next[outcomeIndex - 1], next[outcomeIndex]] = [next[outcomeIndex], next[outcomeIndex - 1]];
                    setOutcomes(next);
                  }}>↑</button>
                  <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-slate-600" disabled={outcomeIndex === outcomes.length - 1} onClick={() => {
                    if (outcomeIndex >= outcomes.length - 1) return;
                    const next = [...outcomes];
                    [next[outcomeIndex], next[outcomeIndex + 1]] = [next[outcomeIndex + 1], next[outcomeIndex]];
                    setOutcomes(next);
                  }}>↓</button>
                  <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-red-600" disabled={outcomes.length <= 1} onClick={() => {
                    if (outcomes.length <= 1) return;
                    setOutcomes(outcomes.filter((_, itemIndex) => itemIndex !== outcomeIndex));
                  }}>Remove</button>
                </div>
                <StepConditionEditor
                  objectKey={rootObjectKey}
                  extraResources={extraResources}
                  value={outcome.condition || { type: "all", rules: [blankCondition()] }}
                  onChange={(condition) => {
                    const next = [...outcomes];
                    next[outcomeIndex] = { ...outcome, condition };
                    setOutcomes(next);
                  }}
                />
                <BranchStepPicker
                  label={`${outcome.label || `Outcome ${outcomeIndex + 1}`} path`}
                  value={outcome.branch || []}
                  onChange={(branch) => {
                    const next = [...outcomes];
                    next[outcomeIndex] = { ...outcome, branch };
                    setOutcomes(next);
                  }}
                  steps={allSteps}
                  currentIndex={index}
                />
              </div>
            ))}
            <button type="button" className="text-sm text-blue-700" disabled={outcomes.length >= 20} onClick={() => {
              const nextIndex = outcomes.length + 1;
              setOutcomes([...outcomes, {
                id: `outcome-${Date.now()}-${nextIndex}`,
                label: `Outcome ${nextIndex}`,
                condition: { type: "all", rules: [blankCondition()] },
                branch: [],
              }]);
            }}>+ Add outcome</button>
            <BranchStepPicker
              label="Default · No outcome matched"
              value={defaultBranch}
              onChange={(nextDefault) => updateConfig({
                outcomes,
                defaultBranch: nextDefault,
                condition: null,
                ifBranch: [],
                elseBranch: [],
              })}
              steps={allSteps}
              currentIndex={index}
            />
          </div>
        );
      }
      case "SCHEDULE_PATH":
        return (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Path name</label>
              <input className={inputClass} value={step.config?.pathLabel || ""} onChange={(event) => updateConfig({ pathLabel: event.target.value })} placeholder="e.g. Follow up after 2 hours" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">When should this path run?</label>
              <select className={inputClass} value={step.config?.scheduleMode || "OFFSET"} onChange={(event) => updateConfig({ scheduleMode: event.target.value })}>
                <option value="OFFSET">After a delay</option>
                <option value="AT_DATETIME">At a date/time Resource</option>
              </select>
            </div>
            {(step.config?.scheduleMode || "OFFSET") === "OFFSET" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Delay</label>
                  <input className={inputClass} type="number" min="0" value={step.config?.delayAmount ?? 30} onChange={(event) => updateConfig({ delayAmount: Number(event.target.value || 0) })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Unit</label>
                  <select className={inputClass} value={step.config?.delayUnit || "MINUTES"} onChange={(event) => updateConfig({ delayUnit: event.target.value })}>
                    <option value="MINUTES">Minutes</option>
                    <option value="HOURS">Hours</option>
                    <option value="DAYS">Days</option>
                  </select>
                </div>
              </div>
            ) : (
              <MetadataResourcePicker objectKey={rootObjectKey} extraResources={extraResources} label="Run at" value={step.config?.runAt || ""} onChange={(runAt) => updateConfig({ runAt })} />
            )}
            <BranchStepPicker label="Scheduled path steps" value={step.config?.branch || []} onChange={(branch) => updateConfig({ branch })} steps={allSteps} currentIndex={index} />
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
              The immediate workflow continues. These selected steps run later as a durable child run and appear separately in Run History.
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
        return <SchemaActionEditor definition={registryDefinition} config={step.config || {}} onChange={updateConfig} rootObjectKey={rootObjectKey} extraResources={extraResources} />;
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

      {debugInfo?.status === "FAILED" && debugInfo?.error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-red-600">Debug failure</div>
          <div className="mt-1 font-semibold">{debugInfo.error.title || "This step could not complete"}</div>
          <div className="mt-2 text-xs leading-5">{debugInfo.error.whatHappened || "The step failed during Debug."}</div>
          <div className="mt-3 rounded-lg border border-red-100 bg-white/80 p-3 text-xs leading-5"><strong>How to fix it:</strong> {debugInfo.error.howToFix || "Check this step's required values and Resources, then run Debug again."}</div>
        </div>
      ) : debugInfo?.status === "COMPLETED" ? (
        <div className={`mt-4 rounded-xl border p-3 text-xs ${debugInfo.simulated ? "border-blue-200 bg-blue-50 text-blue-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {debugInfo.simulated ? "This step was simulated in Debug mode. No external or irreversible action was performed." : "This step completed successfully in the last Debug run."}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select className={inputClass} value={step.type} onChange={(event) => {
            const nextType = event.target.value;
            const nextDefinition = registryOptions.find((option) => option.value === nextType);
            const fresh = makeStep(nextType);
            updateStep(index, { type: nextType, label: nextDefinition?.label || getActionLabel(nextType), config: fresh.config });
          }}>
            {registryOptions
              .filter((option) => ["CONSTANT","FORMULA"].includes(step.type) ? ["CONSTANT","FORMULA"].includes(option.value) : !["CONSTANT","FORMULA"].includes(option.value))
              .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="rounded border border-slate-200 px-3 py-2 text-sm text-slate-600" onClick={() => updateStep(index, { expanded: !step.expanded })}>{step.expanded ? "Collapse" : "Expand"}</button>
        </div>

        {step.expanded && (
          <div className="space-y-3 pt-1">
            {renderConfig()}
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">On Error</summary>
              <div className="mt-3 space-y-3">
                <label className="block space-y-1 text-xs text-slate-600">
                  <span>When this step fails</span>
                  <select className={inputClass} value={step.config?.faultMode || "FAIL"} onChange={(event) => updateConfig({ faultMode: event.target.value })}>
                    <option value="FAIL">Fail the workflow</option>
                    <option value="CONTINUE">Continue to the next step</option>
                    <option value="STOP">Stop the workflow without running later steps</option>
                    <option value="ROUTE">Run an error path</option>
                    <option value="RETRY">Retry, then use the error path or fail</option>
                  </select>
                </label>
                {step.config?.faultMode === "RETRY" ? (
                  <label className="block space-y-1 text-xs text-slate-600">
                    <span>Retry attempts</span>
                    <select className={inputClass} value={Number(step.config?.retryCount || 1)} onChange={(event) => updateConfig({ retryCount: Number(event.target.value) })}>
                      <option value={1}>1 retry</option>
                      <option value={2}>2 retries</option>
                      <option value={3}>3 retries</option>
                    </select>
                  </label>
                ) : null}
                {["ROUTE","RETRY"].includes(step.config?.faultMode || "FAIL") ? (
                  <BranchStepPicker
                    label={step.config?.faultMode === "RETRY" ? "If retries still fail, run these steps" : "Run these steps if this element fails"}
                    value={step.config?.faultBranch || []}
                    onChange={(faultBranch) => updateConfig({ faultBranch })}
                    steps={allSteps}
                    currentIndex={index}
                  />
                ) : null}
                <p className="text-[11px] text-slate-500">Recovery steps can use Fault resources such as Error message and How to fix. Retry is capped at three attempts and recorded in Run History.</p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}


function WorkflowCanvas({ workflow, workflowId, setWorkflow, updateStep, moveStep, duplicateStep, deleteStep, addStepAt, providerAvailable, registryOptions, functionRegistry, availableWorkflows, messageTemplates = [], scopeKey = null, onGuideStepChange, debugTrace = null, objectFieldCatalog = {} }) {
  const [selectedId, setSelectedId] = useState("__start__");
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteTab, setPaletteTab] = useState("elements");
  const selectedIndex = workflow.steps.findIndex((step) => step.id === selectedId);
  const selectedStep = selectedIndex >= 0 ? workflow.steps[selectedIndex] : null;

  useEffect(() => {
    if (selectedId === "__start__") return;
    if (!workflow.steps.length) {
      setSelectedId("__start__");
      return;
    }
    if (!workflow.steps.some((step) => step.id === selectedId)) {
      setSelectedId("__start__");
    }
  }, [workflow.steps, selectedId]);

  useEffect(() => {
    const failedId = workflow.steps.find((step) => debugTrace?.[step.id]?.status === "FAILED")?.id;
    if (failedId) setSelectedId(failedId);
  }, [debugTrace, workflow.steps]);

  const removeStep = (index) => {
    const nextId = workflow.steps[index + 1]?.id || workflow.steps[index - 1]?.id || null;
    deleteStep(index);
    setSelectedId(nextId);
  };
  const addFromPalette = (type, index = workflow.steps.length) => {
    const step = makeStep(type);
    const definition = registryOptions.find((option) => option.value === type);
    if (definition?.label) step.label = definition.label;
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
  const palette = registryOptions
    .filter((option) => option.value !== "WHEN" && !["CONSTANT","FORMULA","SCHEDULE_PATH"].includes(option.value))
    .map((option) => ({ ...option, category: option.category || workflowActionCategory(option.value) }))
    .filter((option) => !paletteSearch.trim() || `${option.label || option.value} ${option.description || ""} ${option.category || ""}`.toLowerCase().includes(paletteSearch.trim().toLowerCase()));
  const paletteGroups = palette.reduce((groups, option) => {
    const category = option.category || "App Actions";
    if (!groups[category]) groups[category] = [];
    groups[category].push(option);
    return groups;
  }, {});
  const globalResources = [
    { label: "Current Record", detail: "The record that started this workflow", type: "Record" },
    { label: "Previous Record", detail: "Values before the triggering update", type: "Record" },
    { label: "Current User", detail: "The user whose context runs the workflow", type: "Global" },
    { label: "Current Date / Time", detail: "The time this workflow step executes", type: "Global" },
  ];
  const stepResources = workflowStepResources(workflow.steps, workflow.steps.length, objectFieldCatalog);
  const resourceSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => ["CONSTANT","FORMULA"].includes(step.type));
  const scheduledPathSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.type === "SCHEDULE_PATH");
  const visibleCanvasSteps = workflow.steps.map((step, index) => ({ step, index })).filter(({ step }) => !["CONSTANT","FORMULA","SCHEDULE_PATH"].includes(step.type));
  const addScheduledPath = () => {
    const path = makeStep("SCHEDULE_PATH");
    path.label = "Scheduled Path";
    const insertAt = workflow.steps.findIndex((step) => step.type !== "SCHEDULE_PATH");
    const target = insertAt < 0 ? workflow.steps.length : insertAt;
    setWorkflow((current) => ({ ...current, steps: [...current.steps.slice(0, target), path, ...current.steps.slice(target)] }));
    setSelectedId("__start__");
  };
  const updateScheduledPath = (index, patch) => updateStep(index, { config: { ...(workflow.steps[index]?.config || {}), ...patch } });
  const removeScheduledPath = (index) => deleteStep(index);
  const addResource = (type) => {
    const resource = makeStep(type);
    resource.label = type === "CONSTANT" ? "Constant" : "Formula";
    const firstActionIndex = workflow.steps.findIndex((step) => !["CONSTANT","FORMULA"].includes(step.type));
    const insertAt = firstActionIndex < 0 ? workflow.steps.length : firstActionIndex;
    setWorkflow((current) => ({ ...current, steps: [...current.steps.slice(0, insertAt), resource, ...current.steps.slice(insertAt)] }));
    setSelectedId(resource.id);
  };
  const resourceQuery = paletteSearch.trim().toLowerCase();
  const visibleGlobalResources = globalResources.filter((item) => !resourceQuery || `${item.label} ${item.detail} ${item.type}`.toLowerCase().includes(resourceQuery));
  const visibleStepResources = stepResources.filter((item) => !resourceQuery || `${item.label} ${item.type}`.toLowerCase().includes(resourceQuery));
  return (
    <div className={`workflow-visual-shell ${!paletteOpen ? "palette-collapsed" : ""} ${!propertiesOpen ? "properties-collapsed" : ""}`}>
      {paletteOpen ? <aside className="workflow-node-palette">
        <div className="workflow-palette-head">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${paletteTab === "elements" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setPaletteTab("elements")}>Elements</button>
            <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${paletteTab === "resources" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setPaletteTab("resources")}>Resources</button>
          </div>
        </div>
        <div className="workflow-palette-search">
          <span>⌕</span>
          <input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} placeholder={paletteTab === "elements" ? "Search elements..." : "Search resources..."} aria-label={paletteTab === "elements" ? "Search workflow elements" : "Search workflow resources"} />
        </div>
        {paletteTab === "elements" ? (
          <>
            <p className="workflow-palette-help">Drag or click an element to add it to the flow.</p>
            <div className="workflow-palette-scroll">
              {Object.entries(paletteGroups).map(([category, options]) => (
                <div key={category}>
                  <div className="workflow-palette-group-title">{category}</div>
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      draggable
                      title={option.description || option.label}
                      onDragStart={(e) => e.dataTransfer.setData("application/x-onepos-flow-element", option.value)}
                      onClick={() => addFromPalette(option.value)}
                      className="workflow-palette-item"
                    >
                      <span className="workflow-palette-item-copy">
                        <strong>{option.label}</strong>
                        {option.description ? <small>{option.description}</small> : null}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {!palette.length ? <div className="workflow-palette-empty">No matching elements</div> : null}
            </div>
          </>
        ) : (
          <>
            <p className="workflow-palette-help">Create reusable constants and formulas here. They do not clutter the canvas.</p>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-blue-700" onClick={() => addResource("CONSTANT")}>+ Constant</button>
              <button type="button" className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-blue-700" onClick={() => addResource("FORMULA")}>+ Formula</button>
            </div>
            <div className="workflow-palette-scroll">
              {resourceSteps.length ? <div className="workflow-palette-group-title">Defined resources</div> : null}
              {resourceSteps.map(({ step, index }) => (
                <button key={step.id} type="button" className="workflow-palette-item" onClick={() => setSelectedId(step.id)}>
                  <span className="workflow-palette-item-copy">
                    <strong>{step.config?.resourceName || (step.type === "CONSTANT" ? "New Constant" : "New Formula")}</strong>
                    <small>{step.type === "CONSTANT" ? `Constant · ${step.config?.resourceType || "text"}` : `Formula · ${step.config?.resultType || "number"}`}</small>
                  </span>
                </button>
              ))}
              <div className="workflow-palette-group-title">Flow context</div>
              {visibleGlobalResources.map((resource) => (
                <div key={resource.label} className="workflow-palette-item">
                  <span className="workflow-palette-item-copy">
                    <strong>{resource.label}</strong>
                    <small>{resource.detail}</small>
                  </span>
                </div>
              ))}
              <div className="workflow-palette-group-title">Step outputs</div>
              {visibleStepResources.map((resource) => (
                <div key={resource.value} className="workflow-palette-item">
                  <span className="workflow-palette-item-copy">
                    <strong>{resource.label}</strong>
                    <small>{resource.type}</small>
                  </span>
                </div>
              ))}
              {!visibleGlobalResources.length && !visibleStepResources.length ? <div className="workflow-palette-empty">No matching resources</div> : null}
            </div>
          </>
        )}
      </aside> : null}
      <main className="workflow-canvas-surface" onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropAt(e, workflow.steps.length)}>
        <div className="workflow-canvas-toolbar">
          <button type="button" onClick={() => setPaletteOpen((value) => !value)}>{paletteOpen ? "Hide elements" : "Show elements"}</button>
          <button type="button" onClick={() => setPropertiesOpen((value) => !value)}>{propertiesOpen ? "Hide properties" : "Show properties"}</button>
        </div>
        <div className="workflow-canvas-lane">
          <button type="button" className="workflow-start-node" onClick={() => setSelectedId("__start__")} title="Configure when this workflow starts">
            <span className="workflow-start-icon">▶</span>
            <span className="workflow-start-title">Start</span>
            <span className="workflow-start-note">{getTriggerLabel(workflow.trigger)}{workflow.conditions?.length ? ` · ${workflow.conditions.length} condition${workflow.conditions.length === 1 ? "" : "s"}` : ""}{scheduledPathSteps.length ? ` · ${scheduledPathSteps.length} scheduled path${scheduledPathSteps.length === 1 ? "" : "s"}` : ""}</span>
          </button>
          <div className="workflow-node-connector" />
          {visibleCanvasSteps.map(({ step, index }) => <div key={step.id} className="workflow-node-wrap" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); dropAt(e, index); }}>
            <button type="button" className="workflow-node-delete" title="Remove step" aria-label={`Remove ${step.label || getActionLabel(step.type)}`} onClick={(event) => { event.stopPropagation(); removeStep(index); }}>×</button>
            <button type="button" draggable onDragStart={(e) => e.dataTransfer.setData("application/x-onepos-flow-node", step.id)} onClick={() => { setSelectedId(step.id); onGuideStepChange?.(step.type === "CONDITION" ? "conditions" : "actions"); }} className={`workflow-node-card ${selectedId === step.id ? "is-selected" : ""} ${step.enabled === false ? "is-disabled" : ""} ${debugTrace?.[step.id]?.status === "FAILED" ? "is-debug-failed" : debugTrace?.[step.id]?.status === "COMPLETED" ? "is-debug-completed" : ""} ${debugTrace?.[step.id]?.simulated ? "is-debug-simulated" : ""}`}>
              <span className="workflow-node-kind">{debugTrace?.[step.id]?.status === "FAILED" ? "Debug failed" : debugTrace?.[step.id]?.simulated ? "Debug simulated" : debugTrace?.[step.id]?.status === "COMPLETED" ? "Debug passed" : getActionLabel(step.type)}</span>
              <span className="workflow-node-title">{step.label || getActionLabel(step.type)}</span>
              {step.type === "CONDITION" ? <span className="workflow-node-note">{Array.isArray(step.config?.outcomes) && step.config.outcomes.length ? `${step.config.outcomes.length} ordered outcome${step.config.outcomes.length === 1 ? "" : "s"} + Default` : "Decision branches are evaluated from metadata conditions."}</span> : null}
              {step.type === "LOOP" ? <span className="workflow-node-note">Runs selected body steps once per collection item.</span> : null}
            </button>
            {visibleCanvasSteps.findIndex((item) => item.index === index) < visibleCanvasSteps.length - 1 ? <div className="workflow-node-connector" /> : null}
          </div>)}
          {!visibleCanvasSteps.length ? <button type="button" className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-5 text-sm text-blue-700" onClick={() => addFromPalette("CREATE_RECORD")}>+ Add first element</button> : null}
          <div className="mt-3 text-center text-xs text-slate-400">Drop elements here to append · drag nodes to reorder</div>
        </div>
      </main>
      {propertiesOpen ? <aside className="workflow-properties-panel">
        <div className="workflow-properties-tabs">
          <span className="workflow-properties-tab is-active">Properties</span>
          <span className="workflow-properties-tab">Node Settings</span>
        </div>
        {selectedId === "__start__" ? (
          <div className="space-y-4 rounded-xl bg-white p-2">
            <div>
              <div className="text-sm font-semibold text-slate-800">Start</div>
              <p className="mt-1 text-xs text-slate-500">Define exactly when this workflow is allowed to begin. Entry conditions are evaluated before any action runs.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Trigger object</label>
              <PlatformFieldPicker
                scopeKey={scopeKey}
                includeObjectSelector
                objectOnly
                selectedObjectKey={workflow.object || ""}
                onObjectChange={(object) => setWorkflow((current) => ({ ...current, object }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Trigger</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{getTriggerLabel(workflow.trigger)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-700">Scheduled paths</div>
                  <p className="mt-1 text-[11px] text-slate-500">Run selected steps later without using a Wait element in the immediate path.</p>
                </div>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-blue-700" onClick={addScheduledPath}>+ Add path</button>
              </div>
              <div className="space-y-3">
                {scheduledPathSteps.map(({ step: pathStep, index: pathIndex }) => (
                  <div key={pathStep.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center gap-2">
                      <input className={inputClass} value={pathStep.config?.pathLabel || ""} onChange={(event) => updateScheduledPath(pathIndex, { pathLabel: event.target.value })} placeholder="Path name" />
                      <button type="button" className="rounded border border-slate-200 px-2 py-2 text-xs text-red-600" onClick={() => removeScheduledPath(pathIndex)}>Remove</button>
                    </div>
                    <select className={inputClass} value={pathStep.config?.scheduleMode || "OFFSET"} onChange={(event) => updateScheduledPath(pathIndex, { scheduleMode: event.target.value })}>
                      <option value="OFFSET">Run after a delay</option>
                      <option value="AT_DATETIME">Run at date/time from record</option>
                    </select>
                    {(pathStep.config?.scheduleMode || "OFFSET") === "OFFSET" ? (
                      <div className="grid grid-cols-[1fr_1fr] gap-2">
                        <input className={inputClass} type="number" min="0" value={Number(pathStep.config?.delayAmount ?? 30)} onChange={(event) => updateScheduledPath(pathIndex, { delayAmount: Math.max(0, Number(event.target.value || 0)) })} />
                        <select className={inputClass} value={pathStep.config?.delayUnit || "MINUTES"} onChange={(event) => updateScheduledPath(pathIndex, { delayUnit: event.target.value })}>
                          <option value="MINUTES">Minutes later</option>
                          <option value="HOURS">Hours later</option>
                          <option value="DAYS">Days later</option>
                        </select>
                      </div>
                    ) : (
                      <MetadataResourcePicker objectKey={workflow.object || ""} extraResources={[]} label="Date / time Resource" value={pathStep.config?.runAt || ""} onChange={(runAt) => updateScheduledPath(pathIndex, { runAt })} />
                    )}
                    <BranchStepPicker
                      label="Steps on this scheduled path"
                      value={pathStep.config?.branch || []}
                      onChange={(branch) => updateScheduledPath(pathIndex, { branch })}
                      steps={workflow.steps.filter((candidate) => candidate.type !== "SCHEDULE_PATH")}
                      currentIndex={-1}
                    />
                  </div>
                ))}
                {!scheduledPathSteps.length ? <div className="text-[11px] text-slate-500">No scheduled paths. Immediate workflow steps run normally.</div> : null}
              </div>
            </div>

            {workflow.object ? (
              <div>
                <div className="mb-2 text-xs font-semibold text-slate-700">Entry conditions</div>
                <StepConditionEditor
                  objectKey={workflow.object}
                  value={{ type: workflow.match || "all", rules: workflow.conditions?.length ? workflow.conditions : [blankCondition()] }}
                  onChange={(condition) => setWorkflow((current) => ({
                    ...current,
                    match: condition.type || "all",
                    conditions: condition.rules || [],
                  }))}
                />
                <p className="mt-2 text-[11px] text-slate-500">Use Changed / Changed to when the workflow should run only on a transition instead of every later edit.</p>
              </div>
            ) : <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">Choose an object to configure record entry conditions.</div>}
          </div>
        ) : selectedStep ? <StepEditor step={selectedStep} index={selectedIndex} allSteps={workflow.steps} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={removeStep} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={availableWorkflows.filter((item) => (item.runtimeActive === true || item.active !== false) && String(item.id) !== String(workflowId || ""))} messageTemplates={messageTemplates} rootObjectKey={workflow.object || ""} scopeKey={scopeKey} debugInfo={debugTrace?.[selectedStep.id] || null} objectFieldCatalog={objectFieldCatalog} /> : <p className="text-sm text-slate-500">Select Start or a flow element to configure it.</p>}
      </aside> : null}
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
    runtimeActive: initialWorkflow.runtimeActive ?? initialWorkflow.runtime_active ?? initialWorkflow.active !== false,
    activeVersion: Number(initialWorkflow.activeVersion || initialWorkflow.active_version || 0) || null,
    draftVersion: Number(initialWorkflow.draftVersion || initialWorkflow.draft_version || 0) || null,
    conditions: initialWorkflow.conditions || [],
    match: initialWorkflow.action?.match || initialWorkflow.match || "all",
    inputContract: initialWorkflow.action?.inputContract || initialWorkflow.inputContract || [],
    outputContract: initialWorkflow.action?.outputContract || initialWorkflow.outputContract || [],
    scope: initialWorkflow.scope || initialWorkflow.action?.scope || null,
    actionMetadata: {
      flowType: initialWorkflow.action?.flowType || null,
      templateKey: initialWorkflow.action?.templateKey || null,
      defaultForNewDevices: initialWorkflow.action?.defaultForNewDevices === true,
      ui: initialWorkflow.action?.ui || null,
    },
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
        apiParameters: { ...(step.config?.apiParameters || {}), ...Object.fromEntries(Object.entries(step).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))) },
        ...((step.type || step.key) === "FORMULA" ? { formulaInputs: step.formulaInputs || step.inputs || step.config?.formulaInputs || step.config?.inputs || {} } : {}),
      },
    })),
  } : null;
  const [workflowId, setWorkflowId] = useState(() => normalizedInitialWorkflow?.id || null);
  const [workflow, setWorkflow] = useState(() => {
    if (normalizedInitialWorkflow) return normalizedInitialWorkflow;
    return {
      name: scopeKey === "whatsapp_assistant" ? "WhatsApp Assistant Workflow" : "",
      object: "",
      trigger: scopeKey === "whatsapp_assistant" ? "whatsapp_message_received" : "manual",
      version: 1,
      lifecycleStatus: "DRAFT",
      active: false,
      inputContract: [],
      outputContract: [],
      steps: scopeKey === "whatsapp_assistant"
        ? [
            { ...makeStep("WHEN"), type: "CONDITION", label: "Decision" },
            { ...makeStep("SEND_WHATSAPP"), config: { ...makeStep("SEND_WHATSAPP").config, template: "", recipient: "customer.phone" } },
          ]
        : [],
    };
  });

  const [guideStep, setGuideStep] = useState("trigger");
  const [showBuilder, setShowBuilder] = useState(embedded);
  const [savedWorkflows, setSavedWorkflows] = useState(() => embedded && normalizedInitialWorkflow ? [normalizedInitialWorkflow] : []);
  const [providerAvailable, setProviderAvailable] = useState({ EMAIL: false, SMS: false, WHATSAPP: false });
  const [registryOptions, setRegistryOptions] = useState(scopeKey ? [] : actionOptions);
  const [functionRegistry, setFunctionRegistry] = useState([]);
  const [messageTemplates, setMessageTemplates] = useState([]);
  const [workflowListSearch, setWorkflowListSearch] = useState("");
  const [workflowListFilter, setWorkflowListFilter] = useState("all");
  const [triggerOptions, setTriggerOptions] = useState([
    { key: "after_create", label: "After a record is created", kind: "record" },
    { key: "after_update", label: "After a record is updated", kind: "record" },
    { key: "after_save", label: "After a record is created or updated", kind: "record" },
    { key: "manual", label: "Manual trigger", kind: "record" },
  ]);
  const [builderLoadIssues, setBuilderLoadIssues] = useState([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugMode, setDebugMode] = useState("debug");
  const [debugRunning, setDebugRunning] = useState(false);
  const [debugRecordMode, setDebugRecordMode] = useState("latest");
  const [debugRecordId, setDebugRecordId] = useState("");
  const [debugResult, setDebugResult] = useState(null);
  const [testsOpen, setTestsOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [savedTests, setSavedTests] = useState([]);
  const [workflowVersions, setWorkflowVersions] = useState([]);
  const [compareVersionId, setCompareVersionId] = useState(null);
  const [testDraft, setTestDraft] = useState({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Workflow completes" }] });
  const [testBusyId, setTestBusyId] = useState(null);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [objectFieldCatalog, setObjectFieldCatalog] = useState({});


  useEffect(() => {
    if (scopeKey === "whatsapp_assistant") return;
    apiRequest("/api/platform/workflow-triggers")
      .then((response) => {
        const options = Array.isArray(response?.data) ? response.data : [];
        if (options.length) setTriggerOptions(options);
      })
      .catch((error) => setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load workflow triggers."])]));
  }, [scopeKey]);

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
        inputContract: [],
        outputContract: [],
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
        const registry = (Array.isArray(source) ? source : []).map((item) => ({
          value: item.key,
          label: item.displayName || item.key,
          description: item.description || "",
          category: workflowActionCategory(item.key),
          schema: item.schema || null,
          requiredPermissions: Array.isArray(item.requiredPermissions) ? item.requiredPermissions : [],
          requiredEntitlement: item.requiredEntitlement || null,
          capability: item.capability || null,
          async: item.async === true,
        }));
        if (registry.length) setRegistryOptions(registry);
      })
      .catch((error) => setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load workflow actions."])]));
  }, [scopeKey]);

  useEffect(() => {
    apiRequest("/api/platform/function-registry")
      .then((response) => setFunctionRegistry(Array.isArray(response?.data) ? response.data : []))
      .catch((error) => onError?.(error.message || "Unable to load registered functions"));
  }, [onError]);

  useEffect(() => {
    apiRequest("/api/platform/message-templates")
      .then((response) => setMessageTemplates(Array.isArray(response?.data) ? response.data.filter((item) => item.active !== false) : []))
      .catch((error) => {
        setMessageTemplates([]);
        setBuilderLoadIssues((current) => [...new Set([...current, error.message || "Unable to load message templates."])]);
      });
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
          runtimeActive: rule.runtime_active === true || rule.active === true,
          activeVersion: Number(rule.active_version || 0) || null,
          draftVersion: Number(rule.draft_version || 0) || null,
          scope: rule.action.scope || null,
          systemGenerated: rule.action.systemGenerated === true,
          systemKey: rule.action.systemKey || null,
          capabilityType: rule.action.capabilityType || null,
          capabilityKey: rule.action.capabilityKey || null,
          match: rule.action.match || "all",
          inputContract: rule.action.inputContract || [],
          outputContract: rule.action.outputContract || [],
          actionMetadata: {
            flowType: rule.action?.flowType || null,
            templateKey: rule.action?.templateKey || null,
            defaultForNewDevices: rule.action?.defaultForNewDevices === true,
            ui: rule.action?.ui || null,
          },
          lifecycleStatus: rule.lifecycle_status || (rule.active === false ? "INACTIVE" : "ACTIVE"),
          version: Number(rule.version || 1),
          steps: (rule.action.actions || []).map((action) => {
            const base = makeStep(action.type || action.key);
            return {
              ...base,
              id: action.id || base.id,
              label: action.label || getActionLabel(action.type || action.key),
              type: action.type || action.key,
              config: {
                ...base.config,
                ...action,
                apiParameters: {
                  ...(action.apiParameters || {}),
                  ...Object.fromEntries(Object.entries(action).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))),
                },
                ...(action.type === "FORMULA" ? { formulaInputs: action.formulaInputs || action.inputs || {} } : {}),
              },
            };
          }),
        }));
        setSavedWorkflows(workflows);
      })
      .catch((error) => onError?.(error.message || "Unable to load workflows"));
  }, [onError]);

  useEffect(() => {
    const objectKeys = [...new Set((workflow.steps || [])
      .filter((step) => step.type === "GET_RECORDS" && step.config?.object)
      .map((step) => step.config.object))];
    if (!objectKeys.length) return;
    let live = true;
    (async () => {
      try {
        const objectsResponse = await apiRequest("/api/platform/objects");
        const objects = objectsResponse?.data?.objects || objectsResponse?.data || [];
        const next = { ...objectFieldCatalog };
        for (const objectKey of objectKeys) {
          if (next[objectKey]) continue;
          const object = objects.find((item) => String(item.object_key || item.api_name || item.key || "") === String(objectKey));
          if (!object?.id) continue;
          const response = await apiRequest(`/api/platform/objects/${encodeURIComponent(object.id)}/record-paths?depth=1`);
          const paths = Array.isArray(response?.data) ? response.data : [];
          next[objectKey] = paths
            .filter((path) => path.kind === "field" && String(path.path || "").split(".").length === 2)
            .map((path) => ({
              apiName: String(path.path).split(".").at(-1),
              label: path.label || String(path.path).split(".").at(-1),
              type: path.fieldType || "field",
            }));
        }
        if (live) setObjectFieldCatalog(next);
      } catch {
        // MetadataResourcePicker still exposes the core record/count/collection resources.
      }
    })();
    return () => { live = false; };
  }, [workflow.steps]);

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

  const isKioskExperience = String(workflow.actionMetadata?.flowType || "").toUpperCase() === "KIOSK_EXPERIENCE";
  const kioskUi = workflow.actionMetadata?.ui && typeof workflow.actionMetadata.ui === "object"
    ? workflow.actionMetadata.ui
    : { schemaVersion: 1, startScreen: "catalogue", screens: [], features: {} };

  const updateKioskUi = (patch) => setWorkflow((current) => ({
    ...current,
    actionMetadata: {
      ...(current.actionMetadata || {}),
      flowType: "KIOSK_EXPERIENCE",
      ui: { ...(current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} }), ...patch },
    },
  }));

  const updateKioskScreen = (index, patch) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const screens = [...(ui.screens || [])];
    screens[index] = { ...screens[index], ...patch };
    return { ...current, actionMetadata: { ...(current.actionMetadata || {}), ui: { ...ui, screens } } };
  });

  const moveKioskScreen = (index, direction) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const screens = [...(ui.screens || [])];
    const target = index + direction;
    if (target < 0 || target >= screens.length) return current;
    [screens[index], screens[target]] = [screens[target], screens[index]];
    return { ...current, actionMetadata: { ...(current.actionMetadata || {}), ui: { ...ui, screens } } };
  });

  const removeKioskScreen = (index) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const screens = (ui.screens || []).filter((_, screenIndex) => screenIndex !== index);
    const startScreen = screens.some((screen) => screen.key === ui.startScreen) ? ui.startScreen : (screens[0]?.key || "");
    return { ...current, actionMetadata: { ...(current.actionMetadata || {}), ui: { ...ui, screens, startScreen } } };
  });

  const addKioskScreen = (type) => setWorkflow((current) => {
    const ui = current.actionMetadata?.ui || { schemaVersion: 1, screens: [], features: {} };
    const keyBase = String(type || "screen").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    let key = keyBase;
    let suffix = 2;
    while ((ui.screens || []).some((screen) => screen.key === key)) key = `${keyBase}_${suffix++}`;
    const defaults = {
      CATALOGUE: { title: "Browse products", search: true, categories: true, productAction: "OPEN_DETAIL" },
      PRODUCT_DETAIL: { title: "Product", description: true, variants: true, modifiers: true },
      RECOMMENDATIONS: { title: "You may also like", source: "CROSS_SELL", optional: true },
      FULFILMENT: { title: "Choose fulfilment", options: [{ key: "COLLECT", label: "Collect", canonicalType: "SELF_PICKUP", requires: [] }] },
      BASKET: { title: "Review your order", editable: true, promotions: true },
      LOYALTY: { title: "Rewards", subtitle: "Enter phone or email, or continue as a guest.", optional: true },
      FORM: { title: "Order details", optional: true, fields: [] },
      PAYMENT: { title: "Payment", methods: ["CARD"], actionLabel: "Pay now" },
      CONFIRMATION: { title: "Order confirmed", collectionNumber: true, receipt: ["PRINT","QR"], resetAfterSeconds: 30 },
    };
    const nextScreen = { key, type, ...(defaults[type] || { title: type }) };
    const screens = [...(ui.screens || []), nextScreen];
    return {
      ...current,
      actionMetadata: {
        ...(current.actionMetadata || {}),
        flowType: "KIOSK_EXPERIENCE",
        ui: { ...ui, screens, startScreen: ui.startScreen || screens[0]?.key || key },
      },
    };
  });

  const updateKioskFeature = (key, value) => updateKioskUi({ features: { ...(kioskUi.features || {}), [key]: value } });

  const enabledSteps = (workflow.steps || []).filter((step) => step.enabled !== false);
  const conditionSteps = enabledSteps.filter((step) => step.type === "CONDITION");
  const actionSteps = enabledSteps.filter((step) => step.type !== "CONDITION");
  const triggerNeedsObject = !["manual","whatsapp_message_received","system_function","system_action","system_job"].includes(workflow.trigger);
  const triggerIssue = !workflow.trigger
    ? "Choose a trigger."
    : triggerNeedsObject && !workflow.object
      ? "Choose the trigger object."
      : "";
  const entryConditionIssue = (workflow.conditions || []).length && !conditionIsValid({ rules: workflow.conditions })
    ? "One or more Start conditions are incomplete."
    : "";
  const definitionFor = (step) => registryOptions.find((option) => option.value === step.type) || null;
  const conditionIssue = conditionSteps.length && conditionSteps.some((step) => workflowActionIssue(step, definitionFor(step)))
    ? "One or more conditions are incomplete."
    : "";
  const actionIssues = actionSteps.map((step) => workflowActionIssue(step, definitionFor(step))).filter(Boolean);
  const resourceNames = enabledSteps
    .map((step) => step.type === "ASSIGNMENT" ? step.config?.variableName : ["CONSTANT","FORMULA"].includes(step.type) ? step.config?.resourceName : null)
    .filter(Boolean);
  const duplicateResourceName = resourceNames.find((name, index) => resourceNames.indexOf(name) !== index) || null;
  const kioskScreenIssue = isKioskExperience
    ? !(Array.isArray(kioskUi.screens) && kioskUi.screens.length)
      ? "Add at least one kiosk screen."
      : !kioskUi.startScreen || !(kioskUi.screens || []).some((screen) => screen.key === kioskUi.startScreen)
        ? "Choose a valid kiosk start screen."
        : (kioskUi.screens || []).some((screen) => !screen.key || !screen.type)
          ? "Every kiosk screen needs a key and type."
          : ""
    : "";
  const actionsIssue = isKioskExperience
    ? kioskScreenIssue
    : duplicateResourceName
      ? `Resource name "${duplicateResourceName}" is used more than once.`
      : !actionSteps.length
        ? "Add at least one action."
        : actionIssues[0] || "";
  const contractEntries = [...(workflow.inputContract || []), ...(workflow.outputContract || [])];
  const invalidContractName = contractEntries.find((item) => !item?.name || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(String(item.name)));
  const duplicateInput = (workflow.inputContract || []).find((item, index, list) => list.findIndex((other) => other.name === item.name) !== index);
  const duplicateOutput = (workflow.outputContract || []).find((item, index, list) => list.findIndex((other) => other.name === item.name) !== index);
  const missingOutputSource = (workflow.outputContract || []).find((item) => !item?.source);
  const contractIssue = invalidContractName
    ? "Subflow input/output names can only use letters, numbers and underscores."
    : duplicateInput ? `Subflow input "${duplicateInput.name}" is declared more than once.`
      : duplicateOutput ? `Subflow output "${duplicateOutput.name}" is declared more than once.`
        : missingOutputSource ? `Choose a Resource for subflow output "${missingOutputSource.label || missingOutputSource.name || "output"}".`
          : "";
  const reviewIssue = triggerIssue || entryConditionIssue || conditionIssue || actionsIssue || contractIssue || (!workflow.name ? "Enter a workflow name." : "");
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

  const buildWorkflowPayload = (lifecycleOverride = null) => {
    const nextLifecycle = String(lifecycleOverride || workflow.lifecycleStatus || (workflow.active === true ? "ACTIVE" : "DRAFT")).toUpperCase();
    return {
      objectId: workflow.objectId || null,
      objectKey: workflow.objectKey || workflow.object || null,
      name: workflow.name,
      triggerKey: workflow.trigger,
      conditions: workflow.conditions || [],
      version: Number(workflow.version || 1),
      lifecycleStatus: nextLifecycle,
      active: nextLifecycle === "ACTIVE",
      action: {
        type: "workflow",
        inputContract: workflow.inputContract || [],
        outputContract: workflow.outputContract || [],
        ...(scopeKey ? { scope: scopeKey } : workflow.scope ? { scope: workflow.scope } : {}),
        ...(workflow.systemGenerated ? {
          systemGenerated: true,
          systemKey: workflow.systemKey || null,
          capabilityType: workflow.capabilityType || null,
          capabilityKey: workflow.capabilityKey || null,
          scope: workflow.scope || "system",
        } : {}),
        ...(workflow.actionMetadata?.flowType ? { flowType: workflow.actionMetadata.flowType } : {}),
        ...(workflow.actionMetadata?.templateKey ? { templateKey: workflow.actionMetadata.templateKey } : {}),
        ...(workflow.actionMetadata?.defaultForNewDevices ? { defaultForNewDevices: true } : {}),
        ...(workflow.actionMetadata?.ui ? { ui: workflow.actionMetadata.ui } : {}),
        match: workflow.match || "all",
        actions: workflow.steps.filter((step) => step.enabled !== false).map((step) => {
          const config = { ...(step.config || {}) };
          if (config.fieldMappings && !config.fieldValues) config.fieldValues = config.fieldMappings;
          if (config.template && !config.templateId) config.templateId = config.template;
          if (step.type === "FORMULA") {
            config.inputs = config.formulaInputs || config.inputs || {};
            delete config.formulaInputs;
          }
          const apiParameters = config.apiParameters && typeof config.apiParameters === "object" ? config.apiParameters : {};
          delete config.apiParameters;
          return { id: step.id, label: step.label || getActionLabel(step.type), type: step.type, ...apiParameters, ...config };
        }),
      },
    };
  };

  const saveWorkflow = async (lifecycleOverride = null, { keepOpen = false, silent = false, forceNewVersion = false } = {}) => {
    const nextLifecycle = String(lifecycleOverride || workflow.lifecycleStatus || (workflow.active === true ? "ACTIVE" : "DRAFT")).toUpperCase();
    if (nextLifecycle === "ACTIVE" && reviewIssue) {
      onError?.(`Cannot activate workflow: ${reviewIssue}`);
      return null;
    }
    const payload = { ...buildWorkflowPayload(nextLifecycle), ...(forceNewVersion ? { forceNewVersion: true } : {}) };
    try {
      const response = workflowId
        ? await apiRequest(`/api/platform/rules/${workflowId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiRequest("/api/platform/rules", { method: "POST", body: JSON.stringify(payload) });
      const saved = response?.data || {};
      const nextId = saved.id || workflowId;
      setWorkflowId(nextId);
      const savedWorkflow = {
        ...workflow,
        ...saved,
        id: nextId,
        lifecycleStatus: nextLifecycle,
        active: nextLifecycle === "ACTIVE",
        runtimeActive: saved.runtime_active ?? saved.runtimeActive ?? (nextLifecycle === "ACTIVE" ? true : workflow.runtimeActive === true),
        activeVersion: Number(saved.active_version || saved.activeVersion || workflow.activeVersion || 0) || null,
        draftVersion: Number(saved.draft_version || saved.draftVersion || (nextLifecycle === "DRAFT" ? saved.version || workflow.version : 0)) || null,
      };
      setWorkflow(savedWorkflow);
      setSavedWorkflows((current) => [savedWorkflow, ...current.filter((item) => item.id !== nextId)]);
      if (embedded) onSaved?.({ ...workflow, ...saved, id: nextId });
      else if (!keepOpen) setShowBuilder(false);
      if (!silent) onMessage?.(forceNewVersion ? `Workflow saved as version ${saved.version || savedWorkflow.version}.` : nextLifecycle === "ACTIVE" ? "Workflow activated." : "Workflow draft saved.");
      return { id: nextId, workflow: savedWorkflow };
    } catch (error) {
      onError?.(error.message || "Unable to save workflow.");
      return null;
    }
  };

  const debugTrace = (() => {
    const trace = {};
    for (const stepRun of debugResult?.steps || []) {
      const baseId = String(stepRun.step_identifier || "").split("@")[0];
      if (!baseId) continue;
      const current = trace[baseId];
      const status = String(stepRun.status || "").toUpperCase();
      const result = stepRun.metadata?.result || {};
      const next = {
        status,
        simulated: result?.simulated === true,
        error: stepRun.metadata?.friendlyError || (stepRun.error_text ? { title: "This step could not complete", whatHappened: stepRun.error_text, howToFix: "Open the step Properties and check its required values and Resources." } : null),
      };
      if (!current || status === "FAILED" || (current.status !== "FAILED" && status === "COMPLETED")) trace[baseId] = next;
    }
    return trace;
  })();

  const loadSavedTests = async () => {
    if (!workflowId) { setSavedTests([]); return; }
    try {
      const response = await apiRequest(`/api/platform/rules/${workflowId}/tests`);
      setSavedTests(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      onError?.(error.message || "Unable to load workflow tests.");
    }
  };

  const loadWorkflowVersions = async () => {
    if (!workflowId) { setWorkflowVersions([]); return; }
    try {
      setVersionsBusy(true);
      const response = await apiRequest(`/api/platform/rules/${workflowId}/versions`);
      setWorkflowVersions(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      onError?.(error.message || "Unable to load workflow versions.");
    } finally {
      setVersionsBusy(false);
    }
  };

  const assertionLabel = (assertion) => {
    if (assertion.type === "RUN_STATUS") return `Workflow status is ${assertion.expected || "COMPLETED"}`;
    const step = workflow.steps.find((item) => String(item.id) === String(assertion.stepId || ""));
    if (assertion.type === "STEP_STATUS") return `${step?.label || "Step"} status is ${assertion.expected || "COMPLETED"}`;
    if (assertion.type === "DECISION_OUTCOME") return `${step?.label || "Decision"} outcome is ${assertion.expected || "selected outcome"}`;
    if (assertion.type === "RESOURCE_EQUALS") return `${assertion.resource || "Resource"} equals expected value`;
    return assertion.label || "Assertion";
  };

  const saveTestCase = async () => {
    let id = workflowId || null;
    if (!id) {
      const saved = await saveWorkflow("DRAFT", { keepOpen: true, silent: true });
      if (!saved?.id) return;
      id = saved.id;
    }
    if (!testDraft.name.trim()) { onError?.("Enter a test name."); return; }
    try {
      setTestBusyId("new");
      await apiRequest(`/api/platform/rules/${id}/tests`, {
        method: "POST",
        body: JSON.stringify({
          name: testDraft.name.trim(),
          config: {
            recordMode: testDraft.recordMode,
            recordId: testDraft.recordMode === "specific" ? testDraft.recordId.trim() : "",
            assertions: testDraft.assertions || [],
          },
        }),
      });
      setTestDraft({ name: "", recordMode: "latest", recordId: "", assertions: [{ type: "RUN_STATUS", expected: "COMPLETED", label: "Workflow completes" }] });
      await loadSavedTests();
      onMessage?.("Workflow test saved.");
    } catch (error) {
      onError?.(error.message || "Unable to save workflow test.");
    } finally {
      setTestBusyId(null);
    }
  };

  const runSavedTest = async (test) => {
    if (!workflowId) return;
    try {
      setTestBusyId(test.id);
      setDebugMode("test");
      setDebugOpen(true);
      const definition = buildWorkflowPayload("DRAFT");
      const response = await apiRequest(`/api/platform/rules/${workflowId}/tests/${test.id}/run`, {
        method: "POST",
        body: JSON.stringify({ definition }),
      });
      const result = response?.data || null;
      setDebugResult(result);
      await loadSavedTests();
    } catch (error) {
      onError?.(error.message || "Unable to run saved workflow test.");
    } finally {
      setTestBusyId(null);
    }
  };

  const deleteSavedTest = async (testId) => {
    if (!workflowId) return;
    try {
      await apiRequest(`/api/platform/rules/${workflowId}/tests/${testId}`, { method: "DELETE" });
      await loadSavedTests();
    } catch (error) {
      onError?.(error.message || "Unable to remove workflow test.");
    }
  };

  const compareVersionSummary = (versionItem) => {
    const oldDefinition = versionItem?.definition || {};
    const currentDefinition = buildWorkflowPayload(workflow.lifecycleStatus || "DRAFT");
    const currentActions = currentDefinition.action?.actions || [];
    const oldActions = oldDefinition.action?.actions || [];
    const currentById = new Map(currentActions.filter((item) => item?.id).map((item) => [String(item.id), item]));
    const oldById = new Map(oldActions.filter((item) => item?.id).map((item) => [String(item.id), item]));
    const added = [...currentById.keys()].filter((id) => !oldById.has(id)).length;
    const removed = [...oldById.keys()].filter((id) => !currentById.has(id)).length;
    const changed = [...currentById.keys()].filter((id) => oldById.has(id) && JSON.stringify(currentById.get(id)) !== JSON.stringify(oldById.get(id))).length;
    const changes = [];
    if (String(oldDefinition.name || "") !== String(currentDefinition.name || "")) changes.push("Workflow name changed");
    if (String(oldDefinition.trigger_key || "") !== String(currentDefinition.triggerKey || "")) changes.push("Trigger changed");
    if (String(oldDefinition.object_id || "") !== String(currentDefinition.objectId || "")) changes.push("Trigger object changed");
    if (JSON.stringify(oldDefinition.conditions || []) !== JSON.stringify(currentDefinition.conditions || [])) changes.push("Start conditions changed");
    if (added) changes.push(`${added} step${added === 1 ? "" : "s"} added`);
    if (removed) changes.push(`${removed} step${removed === 1 ? "" : "s"} removed`);
    if (changed) changes.push(`${changed} step${changed === 1 ? "" : "s"} changed`);
    if (JSON.stringify(oldDefinition.action?.inputContract || []) !== JSON.stringify(currentDefinition.action?.inputContract || [])) changes.push("Subflow inputs changed");
    if (JSON.stringify(oldDefinition.action?.outputContract || []) !== JSON.stringify(currentDefinition.action?.outputContract || [])) changes.push("Subflow outputs changed");
    return changes.length ? changes : ["No definition differences from the current Builder state"];
  };

  const restoreWorkflowVersion = async (version) => {
    if (!workflowId) return;
    try {
      setVersionsBusy(true);
      await apiRequest(`/api/platform/rules/${workflowId}/versions/${version}/restore`, { method: "POST" });
      const response = await apiRequest("/api/platform/rules");
      const rule = (Array.isArray(response?.data) ? response.data : []).find((item) => String(item.id) === String(workflowId));
      if (!rule) throw new Error("Restored workflow could not be reloaded");
      const restored = {
        ...rule,
        id: rule.id,
        name: rule.name,
        object: rule.object_key || rule.object || "",
        objectId: rule.object_id || null,
        objectKey: rule.object_key || "",
        trigger: rule.trigger_key,
        active: false,
        scope: rule.action?.scope || null,
        inputContract: rule.action?.inputContract || [],
        outputContract: rule.action?.outputContract || [],
        match: rule.action?.match || "all",
        lifecycleStatus: "DRAFT",
        version: Number(rule.version || 1),
        actionMetadata: {
          flowType: rule.action?.flowType || null,
          templateKey: rule.action?.templateKey || null,
          defaultForNewDevices: rule.action?.defaultForNewDevices === true,
          ui: rule.action?.ui || null,
        },
        conditions: rule.conditions || [],
        steps: (rule.action?.actions || []).map((action) => {
          const base = makeStep(action.type || action.key);
          return {
            ...base,
            id: action.id || base.id,
            label: action.label || getActionLabel(action.type || action.key),
            type: action.type || action.key,
            config: {
              ...base.config,
              ...action,
              apiParameters: {
                ...(action.apiParameters || {}),
                ...Object.fromEntries(Object.entries(action).filter(([key]) => !["id","type","key","label","enabled","expanded","config","_visual"].includes(key))),
              },
              ...(action.type === "FORMULA" ? { formulaInputs: action.formulaInputs || action.inputs || {} } : {}),
            },
          };
        }),
      };
      setWorkflow(restored);
      setSavedWorkflows((current) => [restored, ...current.filter((item) => String(item.id) !== String(workflowId))]);
      await loadWorkflowVersions();
      onMessage?.(`Version ${version} restored as new draft version ${restored.version}.`);
    } catch (error) {
      onError?.(error.message || "Unable to restore workflow version.");
    } finally {
      setVersionsBusy(false);
    }
  };

  const runDebug = async () => {
    if (reviewIssue) {
      onError?.(`Fix the workflow before Debug: ${reviewIssue}`);
      return;
    }
    setDebugRunning(true);
    setDebugResult(null);
    try {
      const definition = buildWorkflowPayload("DRAFT");
      const endpoint = workflowId ? `/api/platform/rules/${workflowId}/debug` : "/api/platform/rules/debug";
      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          definition,
          mode: debugMode,
          ...(debugRecordMode === "specific" && debugRecordId.trim() ? { recordId: debugRecordId.trim() } : {}),
        }),
      });
      setDebugResult(response?.data || null);
    } catch (error) {
      onError?.(error.message || "Unable to run Debug.");
    } finally {
      setDebugRunning(false);
    }
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
                  {item.runtimeActive ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">LIVE{item.activeVersion ? ` v${item.activeVersion}` : ""}</span> : null}
                  {item.lifecycleStatus === "DRAFT" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">DRAFT{item.version ? ` v${item.version}` : ""}</span> : null}
                </div>
                <span className="block text-xs text-slate-500">
                  {item.object || "No trigger object"} · {getTriggerLabel(item.trigger)}
                  {item.capabilityKey ? ` · ${item.capabilityType || "capability"}: ${item.capabilityKey}` : ""}
                </span>
              </div>
              <div className="flex gap-3">
                <button type="button" className="text-sm text-blue-700" onClick={() => { setWorkflowId(item.id || null); setWorkflow(item); setShowBuilder(true); }}>Edit</button>
                <button type="button" className="text-sm text-indigo-700" onClick={() => {
                  setWorkflowId(null);
                  setWorkflow({
                    ...item,
                    id: null,
                    name: `${item.name || "Workflow"} Copy`,
                    lifecycleStatus: "DRAFT",
                    active: false,
                    version: 1,
                    actionMetadata: item.actionMetadata ? JSON.parse(JSON.stringify(item.actionMetadata)) : null,
                    steps: (item.steps || []).map((step) => ({ ...step, id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}` })),
                  });
                  setShowBuilder(true);
                }}>Clone</button>
                {item.id && (item.runtimeActive === true || item.active !== false) ? <button type="button" className="text-sm text-slate-600" onClick={() => {
                  apiRequest(`/api/platform/rules/${item.id}`, { method: "PUT", body: JSON.stringify({
                    name: item.name,
                    triggerKey: item.trigger,
                    conditions: item.conditions || [],
                    active: false,
                    lifecycleStatus: "INACTIVE",
                    version: Number(item.version || 1),
                    action: {
                      type: "workflow",
                      ...(scopeKey ? { scope: scopeKey } : item.scope ? { scope: item.scope } : {}),
                      ...(item.systemGenerated ? {
                        systemGenerated: true,
                        systemKey: item.systemKey || null,
                        capabilityType: item.capabilityType || null,
                        capabilityKey: item.capabilityKey || null,
                        scope: item.scope || "system",
                      } : {}),
                      ...(item.actionMetadata?.flowType ? { flowType: item.actionMetadata.flowType } : {}),
                      ...(item.actionMetadata?.templateKey ? { templateKey: item.actionMetadata.templateKey } : {}),
                      ...(item.actionMetadata?.defaultForNewDevices ? { defaultForNewDevices: true } : {}),
                      ...(item.actionMetadata?.ui ? { ui: item.actionMetadata.ui } : {}),
                      match: item.match || "all",
                      actions: (item.steps || []).filter((step) => step.enabled !== false).map((step) => ({
                        id: step.id,
                        label: step.label || getActionLabel(step.type),
                        type: step.type,
                        ...(step.config || {}),
                        fieldValues: step.config?.fieldValues || step.config?.fieldMappings,
                      }))
                    },
                  }) }).then(() => setSavedWorkflows((current) => current.map((entry) => entry.id === item.id ? { ...entry, active: false, runtimeActive: false, lifecycleStatus: "INACTIVE", activeVersion: null } : entry))).catch((error) => onError?.(error.message));
                }}>Deactivate</button> : item.id ? <button type="button" className="text-sm text-blue-700" onClick={() => { setWorkflowId(item.id || null); setWorkflow(item); setShowBuilder(true); }}>Open to activate</button> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-builder-page space-y-3">
      <style>{WORKFLOW_VISUAL_CSS}</style>
      {builderLoadIssues.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Some workflow resources could not be loaded.</strong>
          <div className="mt-1 text-xs">{builderLoadIssues.join(" · ")}</div>
          <div className="mt-1 text-xs">Do not assume an empty dropdown means there are no records. Refresh after the connection/API issue is resolved.</div>
        </div>
      ) : null}
      <div id="workflow-trigger-section" className="workflow-builder-header">
        <div className="workflow-builder-heading">
          <span className={`workflow-ready-dot ${reviewIssue ? "has-issue" : ""}`} title={reviewIssue || "Workflow ready"} />
          <h2>Workflow Builder</h2>
        </div>
        <div className="workflow-builder-field">
          <label>Workflow name</label>
          <input className={inputClass} value={workflow.name || ""} onChange={(event) => setWorkflow((current) => ({ ...current, name: event.target.value }))} placeholder="Workflow name" />
        </div>
        <div className="workflow-builder-field">
          <label>Trigger object</label>
          <PlatformFieldPicker
            scopeKey={scopeKey}
            includeObjectSelector
            objectOnly
            selectedObjectKey={workflow.object || ""}
            onObjectChange={(object) => setWorkflow((current) => ({ ...current, object }))}
          />
        </div>
        <div className="workflow-builder-field">
          <label>Trigger</label>
          <select className={inputClass} value={workflow.trigger || "after_update"} onChange={(event) => setWorkflow((current) => ({ ...current, trigger: event.target.value }))}>
            {scopeKey === "whatsapp_assistant" ? <option value="whatsapp_message_received">WhatsApp message received</option> : null}
            {workflow.systemGenerated ? <option value="system_function">System function</option> : null}
            {workflow.systemGenerated ? <option value="system_action">System action</option> : null}
            {workflow.systemGenerated ? <option value="system_job">System job trigger</option> : null}
            {isKioskExperience ? <option value="kiosk_experience">Kiosk experience</option> : null}
            {!scopeKey ? triggerOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>) : null}
          </select>
        </div>
        <div className="workflow-builder-actions">
          <button type="button" className="workflow-cancel-button" disabled={!workflowId} onClick={() => { setTestsOpen((value) => !value); if (!testsOpen) loadSavedTests(); }}>Tests</button>
          <button type="button" className="workflow-cancel-button" disabled={!workflowId} onClick={() => { setVersionsOpen((value) => !value); if (!versionsOpen) loadWorkflowVersions(); }}>Versions</button>
          <button type="button" className="workflow-cancel-button" onClick={() => setDebugOpen(true)}>Debug</button>
          <button type="button" className="workflow-cancel-button" disabled={!workflowId} title={workflowId ? "Create an immutable Draft checkpoint" : "Save this workflow first"} onClick={() => saveWorkflow("DRAFT", { keepOpen: true, forceNewVersion: true })}>Save as New Version</button>
          <button type="button" className="workflow-cancel-button" onClick={() => embedded ? onClose?.() : setShowBuilder(false)}>Cancel</button>
          <button type="button" className="workflow-cancel-button" onClick={() => saveWorkflow("DRAFT")}>Save Draft</button>
          <button type="button" className="workflow-save-button" disabled={Boolean(reviewIssue)} title={reviewIssue || "Activate workflow"} onClick={() => saveWorkflow("ACTIVE")}>Activate</button>
        </div>
      </div>

      {testsOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">Saved Tests</div>
              <p className="mt-1 text-xs text-slate-500">Reusable rollback-safe tests. Assertions make regressions visible after future workflow edits.</p>
            </div>
            <button type="button" className="workflow-cancel-button" onClick={() => setTestsOpen(false)}>Close</button>
          </div>
          <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input className={inputClass} value={testDraft.name} onChange={(event) => setTestDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Test name, e.g. High value order takes VIP path" />
            <div className="grid gap-2 md:grid-cols-2">
              <select className={inputClass} value={testDraft.recordMode} onChange={(event) => setTestDraft((current) => ({ ...current, recordMode: event.target.value }))}>
                <option value="latest">Use latest record</option>
                <option value="specific">Use specific record</option>
              </select>
              {testDraft.recordMode === "specific" ? <input className={inputClass} value={testDraft.recordId} onChange={(event) => setTestDraft((current) => ({ ...current, recordId: event.target.value }))} placeholder="Record ID" /> : <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">Uses the latest accessible record in the current store/company.</div>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-xs text-slate-700">Assertions</strong>
                <button type="button" className="text-xs text-blue-700" onClick={() => setTestDraft((current) => ({ ...current, assertions: [...(current.assertions || []), { type: "STEP_STATUS", stepId: "", expected: "COMPLETED" }] }))}>+ Assertion</button>
              </div>
              {(testDraft.assertions || []).map((assertion, assertionIndex) => {
                const decisionStep = workflow.steps.find((step) => String(step.id) === String(assertion.stepId || ""));
                const outcomes = Array.isArray(decisionStep?.config?.outcomes) ? decisionStep.config.outcomes : [];
                return (
                  <div key={assertionIndex} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <select className={inputClass} value={assertion.type || "RUN_STATUS"} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { type: event.target.value, expected: event.target.value === "RUN_STATUS" ? "COMPLETED" : "", stepId: "", resource: "" } : item) }))}>
                        <option value="RUN_STATUS">Workflow result</option>
                        <option value="STEP_STATUS">Step result</option>
                        <option value="DECISION_OUTCOME">Decision outcome</option>
                        <option value="RESOURCE_EQUALS">Resource equals</option>
                      </select>
                      {["STEP_STATUS","DECISION_OUTCOME"].includes(assertion.type) ? (
                        <select className={inputClass} value={assertion.stepId || ""} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, stepId: event.target.value, expected: "" } : item) }))}>
                          <option value="">Select step</option>
                          {workflow.steps.filter((step) => assertion.type !== "DECISION_OUTCOME" || step.type === "CONDITION").map((step) => <option key={step.id} value={step.id}>{step.label || getActionLabel(step.type)}</option>)}
                        </select>
                      ) : assertion.type === "RESOURCE_EQUALS" ? (
                        <MetadataResourcePicker objectKey={workflow.object || ""} extraResources={workflowStepResources(workflow.steps, workflow.steps.length, objectFieldCatalog)} label="" value={assertion.resource || ""} onChange={(resource) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, resource } : item) }))} />
                      ) : <div />}
                      {assertion.type === "RUN_STATUS" ? (
                        <select className={inputClass} value={assertion.expected || "COMPLETED"} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))}>
                          <option value="COMPLETED">Completes</option><option value="FAILED">Fails</option><option value="NOT_STARTED">Does not start</option>
                        </select>
                      ) : assertion.type === "STEP_STATUS" ? (
                        <select className={inputClass} value={assertion.expected || "COMPLETED"} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))}>
                          <option value="COMPLETED">Completed</option><option value="FAILED">Failed</option><option value="NOT_RUN">Not run</option>
                        </select>
                      ) : assertion.type === "DECISION_OUTCOME" ? (
                        <select className={inputClass} value={assertion.expected || ""} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))}>
                          <option value="">Select outcome</option>
                          {outcomes.map((outcome) => <option key={outcome.id} value={outcome.id}>{outcome.label || outcome.id}</option>)}
                          <option value="Default">Default</option>
                        </select>
                      ) : (
                        <input className={inputClass} value={assertion.expected ?? ""} onChange={(event) => setTestDraft((current) => ({ ...current, assertions: current.assertions.map((item, index) => index === assertionIndex ? { ...item, expected: event.target.value } : item) }))} placeholder="Expected value" />
                      )}
                      <button type="button" className="text-xs text-red-600" onClick={() => setTestDraft((current) => ({ ...current, assertions: current.assertions.filter((_, index) => index !== assertionIndex) }))}>Remove</button>
                    </div>
                    <div className="text-[11px] text-slate-500">{assertionLabel(assertion)}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end"><button type="button" className="workflow-save-button" disabled={testBusyId === "new"} onClick={saveTestCase}>{testBusyId === "new" ? "Saving…" : "Save Test"}</button></div>
          </div>
          <div className="mt-4 space-y-2">
            {savedTests.map((test) => (
              <div key={test.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                <div>
                  <strong className="text-sm text-slate-800">{test.name}</strong>
                  <div className="mt-1 text-[11px] text-slate-500">{(test.config?.assertions || []).length} assertion(s){test.last_status ? ` · Last result: ${test.last_status}` : " · Not run yet"}</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="workflow-cancel-button" disabled={testBusyId === test.id} onClick={() => runSavedTest(test)}>{testBusyId === test.id ? "Running…" : "Run"}</button>
                  <button type="button" className="workflow-cancel-button" onClick={() => deleteSavedTest(test.id)}>Delete</button>
                </div>
              </div>
            ))}
            {!savedTests.length ? <div className="text-xs text-slate-500">No saved tests yet.</div> : null}
          </div>
        </div>
      ) : null}

      {versionsOpen ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">Version History</div>
              <p className="mt-1 text-xs text-slate-500">Every meaningful save creates an immutable snapshot. Restoring creates a new Draft version; history is never overwritten.</p>
            </div>
            <button type="button" className="workflow-cancel-button" onClick={() => setVersionsOpen(false)}>Close</button>
          </div>
          <div className="mt-4 space-y-2">
            {workflowVersions.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div><strong className="text-sm text-slate-800">Version {item.version}</strong><div className="mt-1 text-[11px] text-slate-500">{item.lifecycle_status || "DRAFT"} · {item.created_at ? new Date(item.created_at).toLocaleString("en-GB") : ""}</div></div>
                  <div className="flex gap-2">
                    <button type="button" className="workflow-cancel-button" onClick={() => setCompareVersionId((current) => current === item.id ? null : item.id)}>{compareVersionId === item.id ? "Hide comparison" : "Compare"}</button>
                    <button type="button" className="workflow-cancel-button" disabled={versionsBusy || Number(item.version) === Number(workflow.version)} onClick={() => restoreWorkflowVersion(item.version)}>Restore as new Draft</button>
                  </div>
                </div>
                {compareVersionId === item.id ? (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold text-slate-700">Compared with current Builder state</div>
                    <div className="mt-2 space-y-1">
                      {compareVersionSummary(item).map((change) => <div key={change} className="text-xs text-slate-600">• {change}</div>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
            {versionsBusy ? <div className="text-xs text-slate-500">Loading versions…</div> : !workflowVersions.length ? <div className="text-xs text-slate-500">No version snapshots yet.</div> : null}
          </div>
        </div>
      ) : null}

      <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Subflow interface</summary>
        <p className="mt-2 text-xs text-slate-500">Optional. Declare typed inputs and outputs when this workflow should be reusable from Run Subflow. Normal trigger-based workflows can leave this empty.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs text-slate-700">Inputs</strong>
              <button type="button" className="text-xs text-blue-700" onClick={() => setWorkflow((current) => ({ ...current, inputContract: [...(current.inputContract || []), { name: `input_${(current.inputContract || []).length + 1}`, label: "Input", type: "text", required: false }] }))}>+ Input</button>
            </div>
            {(workflow.inputContract || []).map((input, inputIndex) => (
              <div key={`${input.name}-${inputIndex}`} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1fr_.8fr_auto_auto]">
                <input className={inputClass} value={input.name || ""} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, name: event.target.value.replace(/[^A-Za-z0-9_]/g, "") } : item) }))} placeholder="api_name" />
                <input className={inputClass} value={input.label || ""} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, label: event.target.value } : item) }))} placeholder="Label" />
                <select className={inputClass} value={input.type || "text"} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, type: event.target.value } : item) }))}>
                  {["text","number","boolean","date","datetime","record","collection","object"].map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <label className="flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={input.required === true} onChange={(event) => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).map((item, index) => index === inputIndex ? { ...item, required: event.target.checked } : item) }))} /> Required</label>
                <button type="button" className="text-xs text-red-600" onClick={() => setWorkflow((current) => ({ ...current, inputContract: (current.inputContract || []).filter((_, index) => index !== inputIndex) }))}>Remove</button>
              </div>
            ))}
            {!(workflow.inputContract || []).length ? <div className="text-[11px] text-slate-500">No declared inputs.</div> : null}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs text-slate-700">Outputs</strong>
              <button type="button" className="text-xs text-blue-700" onClick={() => setWorkflow((current) => ({ ...current, outputContract: [...(current.outputContract || []), { name: `output_${(current.outputContract || []).length + 1}`, label: "Output", type: "text", source: "", required: false }] }))}>+ Output</button>
            </div>
            {(workflow.outputContract || []).map((output, outputIndex) => (
              <div key={`${output.name}-${outputIndex}`} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_.8fr_auto]">
                  <input className={inputClass} value={output.name || ""} onChange={(event) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, name: event.target.value.replace(/[^A-Za-z0-9_]/g, "") } : item) }))} placeholder="api_name" />
                  <input className={inputClass} value={output.label || ""} onChange={(event) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, label: event.target.value } : item) }))} placeholder="Label" />
                  <select className={inputClass} value={output.type || "text"} onChange={(event) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, type: event.target.value } : item) }))}>
                    {["text","number","boolean","date","datetime","record","collection","object"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <button type="button" className="text-xs text-red-600" onClick={() => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).filter((_, index) => index !== outputIndex) }))}>Remove</button>
                </div>
                <MetadataResourcePicker objectKey={workflow.object || ""} extraResources={workflowStepResources(workflow.steps, workflow.steps.length, objectFieldCatalog)} label="Output Resource" value={output.source || ""} onChange={(source) => setWorkflow((current) => ({ ...current, outputContract: (current.outputContract || []).map((item, index) => index === outputIndex ? { ...item, source } : item) }))} />
              </div>
            ))}
            {!(workflow.outputContract || []).length ? <div className="text-[11px] text-slate-500">No declared outputs.</div> : null}
          </div>
        </div>
      </details>

      {debugOpen ? (
        <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-slate-800">Debug / Test workflow</div>
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${debugMode === "debug" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDebugMode("debug")}>Debug</button>
                  <button type="button" className={`rounded-md px-2 py-1 text-[10px] font-semibold ${debugMode === "test" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`} onClick={() => setDebugMode("test")}>Test</button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">{debugMode === "debug" ? "Debug shows the path taken and highlights failed steps." : "Test gives a simple pass/fail result using the same safe execution trace."} Database changes are rolled back and external actions such as messages, payments, webhooks and printing are simulated.</p>
            </div>
            <button type="button" className="workflow-cancel-button" onClick={() => setDebugOpen(false)}>Close</button>
          </div>
          {workflow.object ? (
            <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
              <select className={inputClass} value={debugRecordMode} onChange={(event) => setDebugRecordMode(event.target.value)}>
                <option value="latest">Use latest record</option>
                <option value="specific">Use specific record</option>
              </select>
              {debugRecordMode === "specific" ? <input className={inputClass} value={debugRecordId} onChange={(event) => setDebugRecordId(event.target.value)} placeholder="Record ID" /> : <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">The most recent record in the current company/store will be used.</div>}
              <button type="button" className="workflow-save-button" disabled={debugRunning || Boolean(reviewIssue)} onClick={runDebug}>{debugRunning ? "Running…" : debugMode === "test" ? "Run Test" : "Run Debug"}</button>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-600">This workflow has no trigger object, so Debug will run with user/company/store context only.</div>
              <button type="button" className="workflow-save-button" disabled={debugRunning || Boolean(reviewIssue)} onClick={runDebug}>{debugRunning ? "Running…" : debugMode === "test" ? "Run Test" : "Run Debug"}</button>
            </div>
          )}
          {debugResult ? (
            <div className={`mt-4 rounded-xl border p-4 ${debugMode === "test" ? (debugResult.testPassed === true ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50") : debugResult.status === "FAILED" ? "border-red-200 bg-red-50" : debugResult.status === "NOT_STARTED" || debugResult.completedWithHandledError ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-center justify-between gap-3">
                <strong className={debugMode === "test" ? (debugResult.testPassed === true ? "text-emerald-800" : "text-red-800") : debugResult.status === "FAILED" ? "text-red-800" : debugResult.status === "NOT_STARTED" || debugResult.completedWithHandledError ? "text-amber-800" : "text-emerald-800"}>{debugMode === "test" ? (debugResult.testPassed === true ? "Test passed" : "Test failed") : (debugResult.status === "FAILED" ? "Debug found a problem" : debugResult.status === "NOT_STARTED" ? "Debug did not enter the workflow" : debugResult.completedWithHandledError ? "Debug completed with handled error" : "Debug completed successfully")}</strong>
                <span className="text-xs text-slate-500">No database changes were kept.</span>
              </div>
              {debugMode === "test" && debugResult.testPassed === true && debugResult.status !== "COMPLETED" ? (
                <div className="mt-3 text-sm text-emerald-800">
                  The observed workflow result was <strong>{debugResult.status}</strong>, exactly as this test expected.
                  {(debugResult.assertionResult?.checks || []).length ? (
                    <div className="mt-2 space-y-1">
                      {(debugResult.assertionResult.checks || []).map((check) => <div key={check.index} className="rounded-lg bg-white/70 p-2 text-xs">✓ {check.label || check.type}</div>)}
                    </div>
                  ) : null}
                </div>
              ) : debugResult.status === "FAILED" ? (
                <div className="mt-3 space-y-2 text-sm text-red-800">
                  <div><strong>{debugResult.friendlyError?.title || "A step failed"}</strong></div>
                  <div>{debugResult.friendlyError?.whatHappened || debugResult.run?.error_text || "The workflow could not complete."}</div>
                  <div className="rounded-lg bg-white/70 p-3"><strong>How to fix it:</strong> {debugResult.friendlyError?.howToFix || "Click the red step on the canvas and check its Properties."}</div>
                </div>
              ) : debugResult.completedWithHandledError ? (
                <div className="mt-3 space-y-2 text-sm text-amber-800">
                  <div>The workflow continued through an On Error path. The failed step remains red so you can see what was handled.</div>
                  {(debugResult.handledFaults || []).map((fault, index) => (
                    <div key={`${fault.stepId}-${index}`} className="rounded-lg bg-white/80 p-3 text-xs">
                      <strong>{fault.error?.title || "Handled step failure"}</strong>
                      {fault.error?.whatHappened ? <div className="mt-1">{fault.error.whatHappened}</div> : null}
                    </div>
                  ))}
                </div>
              ) : debugResult.status === "NOT_STARTED" ? (
                <div className="mt-2 text-sm text-amber-800">
                  <div>{debugResult.friendlyError?.whatHappened || "The selected record did not meet the workflow Start conditions."}</div>
                  <div className="mt-2 rounded-lg bg-white/70 p-3 text-xs"><strong>What to do:</strong> {debugResult.friendlyError?.howToFix || "Choose another record or review the Start conditions."}</div>
                </div>
              ) : debugMode === "test" && debugResult.testPassed === false ? (
                <div className="mt-3 space-y-2 text-sm text-red-800">
                  <strong>One or more assertions did not match.</strong>
                  {(debugResult.assertionResult?.checks || []).map((check) => (
                    <div key={check.index} className={`rounded-lg p-2 text-xs ${check.passed ? "bg-emerald-50 text-emerald-800" : "bg-white text-red-800"}`}>
                      {check.passed ? "✓" : "✕"} {check.label || check.type} · expected {String(check.expected ?? "—")} · actual {String(check.actual ?? "—")}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-emerald-800">{debugMode === "test" ? "The workflow passed this test record. Green steps ran successfully; dashed green steps were safely simulated." : "Green steps ran successfully. Dashed green steps were simulated because they would contact an external service or perform an irreversible action."}</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {isKioskExperience ? (
        <div id="workflow-canvas-section" className="space-y-3">
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-800">OneKiosk Experience</div>
                <p className="mt-1 max-w-3xl text-xs text-slate-600">This ordered screen flow is the customer journey used by kiosks assigned to this workflow. Reorder, add or remove screens here; no application code is required.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {["CATALOGUE","PRODUCT_DETAIL","RECOMMENDATIONS","FULFILMENT","BASKET","LOYALTY","FORM","PAYMENT","CONFIRMATION"].map((type) => (
                  <button key={type} type="button" className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-blue-700" onClick={() => addKioskScreen(type)}>+ {type.replaceAll("_"," ")}</button>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-700">Collection display</div>
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <label className="text-xs font-medium text-slate-700">Display title
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.title === "string" ? kioskUi.orderDisplay.title : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),title:e.target.value}})} placeholder="Order collection"/>
                </label>
                <label className="text-xs font-medium text-slate-700">In progress label
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.activeLabel === "string" ? kioskUi.orderDisplay.activeLabel : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),activeLabel:e.target.value}})} placeholder="Preparing / Processing"/>
                </label>
                <label className="text-xs font-medium text-slate-700">Ready label
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.readyLabel === "string" ? kioskUi.orderDisplay.readyLabel : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),readyLabel:e.target.value}})} placeholder="Ready to collect"/>
                </label>
                <label className="text-xs font-medium text-slate-700">In progress statuses
                  <input className={inputClass} value={(kioskUi.orderDisplay?.activeStatuses||["PREPARING","ACCEPTED"]).join(", ")} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),activeStatuses:e.target.value.split(",").map(v=>v.trim().toUpperCase()).filter(Boolean)}})}/>
                </label>
                <label className="text-xs font-medium text-slate-700">Ready statuses
                  <input className={inputClass} value={(kioskUi.orderDisplay?.readyStatuses||["READY","READY_FOR_PICKUP"]).join(", ")} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),readyStatuses:e.target.value.split(",").map(v=>v.trim().toUpperCase()).filter(Boolean)}})}/>
                </label>
                <label className="text-xs font-medium text-slate-700">Ready empty text
                  <input className={inputClass} value={typeof kioskUi.orderDisplay?.readyEmpty === "string" ? kioskUi.orderDisplay.readyEmpty : ""} onChange={(e)=>updateKioskUi({orderDisplay:{...(kioskUi.orderDisplay||{}),readyEmpty:e.target.value}})} placeholder="No orders ready"/>
                </label>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="text-xs font-medium text-slate-700">Start screen
                <select className={inputClass} value={kioskUi.startScreen || ""} onChange={(event) => updateKioskUi({ startScreen: event.target.value })}>
                  {(kioskUi.screens || []).map((screen) => <option key={screen.key} value={screen.key}>{screen.title || screen.key} · {screen.type}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-700">Idle timeout (seconds)
                <input className={inputClass} type="number" min="30" value={kioskUi.idleTimeoutSeconds || 75} onChange={(event) => updateKioskUi({ idleTimeoutSeconds: Math.max(30, Number(event.target.value) || 75) })} />
              </label>
              <label className="text-xs font-medium text-slate-700">Attract screen title
                <input className={inputClass} value={typeof kioskUi.attractTitle === "string" ? kioskUi.attractTitle : ""} onChange={(event) => updateKioskUi({ attractTitle: event.target.value })} placeholder="Touch to start" />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ["accessibility","Accessibility"],
                ["language","Language"],
                ["audio","Read aloud"],
                ["ageVerification","Age verification"],
                ["assistance","Need Help"],
                ["idleReset","Idle privacy reset"],
                ["loyalty","Loyalty"],
                ["promotions","Promotions"],
                ["upsell","Upsell / accessories"],
                ["compare","Product compare"],
                ["stockPromise","Stock promise"],
              ].map(([key,label]) => (
                <label key={key} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <input type="checkbox" checked={kioskUi.features?.[key] === true} onChange={(event) => updateKioskFeature(key, event.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {(kioskUi.screens || []).map((screen, index) => (
              <div key={screen.key || index} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</div>
                    <div>
                      <strong className="block text-sm text-slate-800">{screen.title || screen.key || "Kiosk screen"}</strong>
                      <span className="text-xs text-slate-500">{screen.type}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={index === 0} className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40" onClick={() => moveKioskScreen(index,-1)}>↑</button>
                    <button type="button" disabled={index === (kioskUi.screens || []).length - 1} className="rounded border border-slate-200 px-2 py-1 text-xs disabled:opacity-40" onClick={() => moveKioskScreen(index,1)}>↓</button>
                    <button type="button" className="rounded border border-red-200 px-2 py-1 text-xs text-red-700" onClick={() => removeKioskScreen(index)}>Remove</button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <label className="text-xs font-medium text-slate-700">Type
                    <select className={inputClass} value={screen.type || "CATALOGUE"} onChange={(event) => updateKioskScreen(index,{ type:event.target.value })}>
                      {["CATALOGUE","PRODUCT_DETAIL","RECOMMENDATIONS","FULFILMENT","BASKET","LOYALTY","FORM","PAYMENT","CONFIRMATION"].map((type) => <option key={type} value={type}>{type.replaceAll("_"," ")}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-medium text-slate-700">Key
                    <input className={inputClass} value={screen.key || ""} onChange={(event) => updateKioskScreen(index,{ key:event.target.value.trim().replace(/[^a-zA-Z0-9_-]/g,"_") })} />
                  </label>
                  <label className="text-xs font-medium text-slate-700">Title
                    <input className={inputClass} value={typeof screen.title === "string" ? screen.title : ""} onChange={(event) => updateKioskScreen(index,{ title:event.target.value })} />
                  </label>
                  <label className="text-xs font-medium text-slate-700">Next
                    <select className={inputClass} value={screen.next || ""} onChange={(event) => updateKioskScreen(index,{ next:event.target.value || null })}>
                      <option value="">Next screen in order</option>
                      {(kioskUi.screens || []).filter((candidate) => candidate.key !== screen.key).map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.title || candidate.key}</option>)}
                    </select>
                  </label>
                </div>

                <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-[11px] font-semibold text-slate-600">Conditional display / branching</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-4">
                    <input className={inputClass} value={screen.showWhen?.path || ""} onChange={(e)=>updateKioskScreen(index,{showWhen:e.target.value?{...(screen.showWhen||{}),path:e.target.value}:null})} placeholder="Show when path, e.g. fulfilmentType"/>
                    <select className={inputClass} value={screen.showWhen?.operator || "equals"} onChange={(e)=>updateKioskScreen(index,{showWhen:{...(screen.showWhen||{}),operator:e.target.value}})} disabled={!screen.showWhen?.path}>
                      <option value="equals">equals</option><option value="not_equals">not equals</option><option value="in">in list</option><option value="not_in">not in list</option><option value="truthy">is set / true</option><option value="falsy">is empty / false</option><option value="greater_than">greater than</option><option value="less_than">less than</option>
                    </select>
                    <input className={inputClass} value={screen.showWhen?.value ?? ""} onChange={(e)=>updateKioskScreen(index,{showWhen:{...(screen.showWhen||{}),value:e.target.value}})} placeholder="Value" disabled={!screen.showWhen?.path || ["truthy","falsy"].includes(screen.showWhen?.operator)}/>
                    <button type="button" className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600" onClick={()=>updateKioskScreen(index,{showWhen:null})}>Clear condition</button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(screen.nextRules || []).map((rule,ruleIndex)=>(
                      <div key={`${screen.key}-branch-${ruleIndex}`} className="grid gap-2 md:grid-cols-[1fr_150px_1fr_1fr_auto]">
                        <input className={inputClass} value={rule.when?.path || ""} placeholder="Branch path" onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,when:{...(rule.when||{}),path:e.target.value}};updateKioskScreen(index,{nextRules})}}/>
                        <select className={inputClass} value={rule.when?.operator || "equals"} onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,when:{...(rule.when||{}),operator:e.target.value}};updateKioskScreen(index,{nextRules})}}>
                          <option value="equals">equals</option><option value="not_equals">not equals</option><option value="in">in</option><option value="truthy">truthy</option><option value="falsy">falsy</option>
                        </select>
                        <input className={inputClass} value={rule.when?.value ?? ""} placeholder="Value" onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,when:{...(rule.when||{}),value:e.target.value}};updateKioskScreen(index,{nextRules})}}/>
                        <select className={inputClass} value={rule.next || ""} onChange={(e)=>{const nextRules=[...(screen.nextRules||[])];nextRules[ruleIndex]={...rule,next:e.target.value};updateKioskScreen(index,{nextRules})}}>
                          <option value="">Next screen…</option>{(kioskUi.screens||[]).filter((candidate)=>candidate.key!==screen.key).map((candidate)=><option key={candidate.key} value={candidate.key}>{candidate.title||candidate.key}</option>)}
                        </select>
                        <button type="button" className="text-xs text-red-700" onClick={()=>updateKioskScreen(index,{nextRules:(screen.nextRules||[]).filter((_,i)=>i!==ruleIndex)})}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700" onClick={()=>updateKioskScreen(index,{nextRules:[...(screen.nextRules||[]),{when:{path:"",operator:"equals",value:""},next:""}]})}>+ Conditional branch</button>
                  </div>
                </div>

                {screen.type === "CATALOGUE" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={screen.search !== false} onChange={(e)=>updateKioskScreen(index,{search:e.target.checked})}/> Search</label>
                    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={screen.categories !== false} onChange={(e)=>updateKioskScreen(index,{categories:e.target.checked})}/> Categories</label>
                    <select className={inputClass} style={{maxWidth:220}} value={screen.productAction || "OPEN_DETAIL"} onChange={(e)=>updateKioskScreen(index,{productAction:e.target.value})}>
                      <option value="OPEN_DETAIL">Open product detail</option>
                      <option value="ADD">Add directly</option>
                    </select>
                  </div>
                ) : null}

                {screen.type === "PRODUCT_DETAIL" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["description","Description"],["variants","Variants"],["modifiers","Modifiers"],["specifications","Specifications"],
                      ["stockPromise","Stock"],["compare","Compare"],["nutrition","Nutrition"],["allergens","Allergens"],["warranty","Warranty"],
                    ].map(([key,label]) => <label key={key} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"><input type="checkbox" checked={screen[key] === true} onChange={(e)=>updateKioskScreen(index,{[key]:e.target.checked})}/>{label}</label>)}
                  </div>
                ) : null}

                {screen.type === "RECOMMENDATIONS" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-slate-700">Relationship source
                      <select className={inputClass} value={screen.source || "CROSS_SELL"} onChange={(e)=>updateKioskScreen(index,{source:e.target.value})}>
                        <option value="CROSS_SELL">Cross-sell</option><option value="UPSELL">Upsell</option><option value="ACCESSORY">Accessory</option>
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" checked={screen.optional !== false} onChange={(e)=>updateKioskScreen(index,{optional:e.target.checked})}/> Customer may skip this screen</label>
                  </div>
                ) : null}

                {screen.type === "FULFILMENT" ? (
                  <div className="mt-3 space-y-2">
                    {(screen.options || []).map((option, optionIndex) => (
                      <div key={`${screen.key}-option-${optionIndex}`} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                        <input className={inputClass} value={option.key || ""} placeholder="Key" onChange={(e)=>{
                          const options=[...(screen.options||[])]; options[optionIndex]={...option,key:e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_")}; updateKioskScreen(index,{options});
                        }}/>
                        <input className={inputClass} value={typeof option.label==="string"?option.label:""} placeholder="Customer label" onChange={(e)=>{
                          const options=[...(screen.options||[])]; options[optionIndex]={...option,label:e.target.value}; updateKioskScreen(index,{options});
                        }}/>
                        <select className={inputClass} value={option.canonicalType || "SELF_PICKUP"} onChange={(e)=>{
                          const options=[...(screen.options||[])]; options[optionIndex]={...option,canonicalType:e.target.value}; updateKioskScreen(index,{options});
                        }}><option value="SELF_PICKUP">Pickup / collection</option><option value="DELIVERY">Delivery</option></select>
                        <button type="button" className="text-xs text-red-700" onClick={()=>updateKioskScreen(index,{options:(screen.options||[]).filter((_,i)=>i!==optionIndex)})}>Remove</button>
                        <div className="md:col-span-4 flex gap-3 px-1 text-xs">
                          {["STORE","ADDRESS","CONTACT"].map((requirement)=><label key={requirement} className="inline-flex items-center gap-1"><input type="checkbox" checked={(option.requires||[]).includes(requirement)} onChange={(e)=>{
                            const requirements=new Set(option.requires||[]); if(e.target.checked) requirements.add(requirement); else requirements.delete(requirement);
                            const options=[...(screen.options||[])]; options[optionIndex]={...option,requires:[...requirements]}; updateKioskScreen(index,{options});
                          }}/>{requirement.toLowerCase()}</label>)}
                        </div>
                      </div>
                    ))}
                    <button type="button" className="rounded border border-slate-200 px-3 py-2 text-xs font-medium" onClick={()=>updateKioskScreen(index,{options:[...(screen.options||[]),{key:`OPTION_${(screen.options||[]).length+1}`,label:"New option",canonicalType:"SELF_PICKUP",requires:[]}]})}>+ Fulfilment option</button>
                  </div>
                ) : null}

                {screen.type === "FORM" ? (
                  <div className="mt-3 space-y-2">
                    <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={screen.optional !== false} onChange={(e)=>updateKioskScreen(index,{optional:e.target.checked})}/> Customer may skip this form</label>
                    {(screen.fields || []).map((field,fieldIndex)=>(
                      <div key={`${screen.key}-field-${fieldIndex}`} className="grid gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2 md:grid-cols-[1fr_1fr_140px_auto]">
                        <input className={inputClass} value={field.key || ""} placeholder="Field key" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,key:e.target.value.replace(/[^a-zA-Z0-9_]/g,"")};updateKioskScreen(index,{fields})}}/>
                        <input className={inputClass} value={typeof field.label==="string"?field.label:""} placeholder="Customer label" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,label:e.target.value};updateKioskScreen(index,{fields})}}/>
                        <select className={inputClass} value={field.type || "text"} onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,type:e.target.value};updateKioskScreen(index,{fields})}}>
                          {["text","textarea","select","checkbox","email","tel","number","date","time"].map((type)=><option key={type} value={type}>{type}</option>)}
                        </select>
                        <button type="button" className="text-xs text-red-700" onClick={()=>updateKioskScreen(index,{fields:(screen.fields||[]).filter((_,i)=>i!==fieldIndex)})}>Remove</button>
                        <input className={inputClass} value={typeof field.placeholder==="string"?field.placeholder:""} placeholder="Placeholder" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,placeholder:e.target.value};updateKioskScreen(index,{fields})}}/>
                        {field.type==="select" ? <input className={inputClass} value={Array.isArray(field.options)?field.options.map((option)=>typeof option==="string"?option:option.label||option.value).join(", "):""} placeholder="Options, comma separated" onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,options:e.target.value.split(",").map(value=>value.trim()).filter(Boolean)};updateKioskScreen(index,{fields})}}/> : <span />}
                        <label className="inline-flex items-center gap-2 px-1 text-xs"><input type="checkbox" checked={field.required===true} onChange={(e)=>{const fields=[...(screen.fields||[])];fields[fieldIndex]={...field,required:e.target.checked};updateKioskScreen(index,{fields})}}/> Required</label>
                      </div>
                    ))}
                    <button type="button" className="rounded border border-slate-200 px-3 py-2 text-xs font-medium" onClick={()=>updateKioskScreen(index,{fields:[...(screen.fields||[]),{key:`field_${(screen.fields||[]).length+1}`,label:"New field",type:"text",required:false}]})}>+ Form field</button>
                  </div>
                ) : null}

                {screen.type === "PAYMENT" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-medium text-slate-700">Button label<input className={inputClass} value={screen.actionLabel || ""} onChange={(e)=>updateKioskScreen(index,{actionLabel:e.target.value})}/></label>
                    <div className="self-end pb-2 text-xs text-slate-500">OneKiosk currently executes card payment through the device's assigned One Connect instance.</div>
                  </div>
                ) : null}

                {screen.type === "CONFIRMATION" ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="text-xs font-medium text-slate-700">Collection label<input className={inputClass} value={screen.collectionLabel || ""} onChange={(e)=>updateKioskScreen(index,{collectionLabel:e.target.value})}/></label>
                    <label className="text-xs font-medium text-slate-700">Auto reset seconds<input type="number" min="5" className={inputClass} value={screen.resetAfterSeconds || 30} onChange={(e)=>updateKioskScreen(index,{resetAfterSeconds:Math.max(5,Number(e.target.value)||30)})}/></label>
                    <div className="flex items-end gap-3 pb-2 text-xs">
                      {["PRINT","QR","EMAIL"].map((method)=><label key={method} className="inline-flex items-center gap-1"><input type="checkbox" checked={(screen.receipt||[]).includes(method)} onChange={(e)=>{
                        const methods=new Set(screen.receipt||[]); if(e.target.checked) methods.add(method); else methods.delete(method); updateKioskScreen(index,{receipt:[...methods]});
                      }}/>{method}</label>)}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div id="workflow-canvas-section">
          <WorkflowCanvas workflow={workflow} workflowId={workflowId} setWorkflow={setWorkflow} updateStep={updateStep} moveStep={moveStep} duplicateStep={duplicateStep} deleteStep={deleteStep} addStepAt={addStepAt} providerAvailable={providerAvailable} registryOptions={registryOptions} functionRegistry={functionRegistry} availableWorkflows={savedWorkflows} messageTemplates={messageTemplates} scopeKey={scopeKey} onGuideStepChange={setGuideStep} debugTrace={debugTrace} objectFieldCatalog={objectFieldCatalog} />
        </div>
      )}
      <div id="workflow-review-section" className="workflow-review-compact" aria-live="polite">
        {reviewIssue || "Trigger, conditions and actions are valid."}
      </div>
    </div>
  );
}
