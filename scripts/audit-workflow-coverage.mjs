import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageDefinitions } from "../server/services/packageRegistry.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "server");
const OUT = path.join(ROOT, "artifacts");
const ENFORCE = process.argv.includes("--enforce");

const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");
const rel = (file) => path.relative(ROOT, file).replaceAll("\\", "/");
const walk = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : /\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name) ? [full] : [];
    })
  : [];

function workflowActions(workflow) {
  if (Array.isArray(workflow?.actions)) return workflow.actions;
  if (Array.isArray(workflow?.action?.actions)) return workflow.action.actions;
  return [];
}

const packageWorkflows = packageDefinitions().flatMap((definition) =>
  (definition.manifest?.workflows || []).map((workflow) => ({
    source: `package:${definition.packageKey}`,
    name: workflow.name || workflow.label || workflow.key || "(unnamed)",
    apiName: workflow.apiName || workflow.action?.apiName || null,
    flowType: workflow.flowType || workflow.action?.flowType || null,
    actions: workflowActions(workflow),
  }))
);

const systemWorkflows = systemWorkflowDefinitions().map((workflow) => ({
  source: "system",
  name: workflow.name || workflow.systemKey || "(unnamed)",
  apiName: workflow.action?.apiName || workflow.systemKey || null,
  flowType: workflow.action?.flowType || null,
  actions: workflowActions(workflow),
}));

const runtimeWorkflows = [...packageWorkflows, ...systemWorkflows]
  .filter((workflow) => String(workflow.flowType || "").toUpperCase() !== "KIOSK_EXPERIENCE");

const findings = [];

// The legacy source-defined metadata authority must stay deleted. Workflow
// coverage is derived only from package/system metadata authorities.
if (fs.existsSync(path.join(ROOT, "server/services/platformMetadata.js"))) {
  findings.push({ type: "RETIRED_PLATFORM_METADATA_PRESENT", file: "server/services/platformMetadata.js" });
}

// Every persisted runtime workflow must expose a real action graph. Empty
// workflows are metadata placeholders and are not executable coverage.
for (const workflow of runtimeWorkflows) {
  if (!workflow.actions.length) {
    findings.push({
      type: "EMPTY_RUNTIME_WORKFLOW",
      source: workflow.source,
      name: workflow.name,
      apiName: workflow.apiName,
    });
  }
}

const serverSource = read("server/server.js");
const globalGatewayEnabled = /app\.use\(\s*["']\/api["']\s*,\s*createBusinessCommandGateway\(\{\s*db\s*\}\)\s*\)/.test(serverSource);
if (!globalGatewayEnabled) {
  findings.push({ type: "BUSINESS_COMMAND_GATEWAY_MISSING", file: "server/server.js" });
}

// Hidden/legacy execution paths may not bypass the canonical workflow runtime.
const executableFiles = [path.join(SERVER, "server.js"), ...walk(path.join(SERVER, "routes")), ...walk(path.join(SERVER, "services"))];
for (const file of executableFiles) {
  const name = rel(file);
  const text = fs.readFileSync(file, "utf8");
  if (name !== "server/services/platformWorkflow.js") {
    for (const match of text.matchAll(/\bexecuteRegisteredAction\s*\(/g)) {
      findings.push({ type: "DIRECT_REGISTERED_ACTION_BYPASS", file: name, line: text.slice(0, match.index).split("\n").length });
    }
    for (const match of text.matchAll(/\bexecuteWorkflowAction\s*\(/g)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineEnd = text.indexOf("\n", match.index);
      const lineText = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
      if (/function\s+executeWorkflowAction\s*\(/.test(lineText)) continue;
      findings.push({ type: "DIRECT_WORKFLOW_ACTION_BYPASS", file: name, line: text.slice(0, match.index).split("\n").length });
    }
  }
  if (/\bCALL_FUNCTION\b/.test(text)) findings.push({ type: "RETIRED_CALL_FUNCTION_REFERENCE", file: name });
  if (/\bexecuteMediatedRegisteredAction\b/.test(text)) findings.push({ type: "RETIRED_MEDIATED_ACTION_EXECUTOR", file: name });
}

// The old hidden flow-manifest shims must not return after migration.
const runtimeFlowManifestPath = path.join(ROOT, "server/metadata/manifests");
if (fs.existsSync(runtimeFlowManifestPath)) {
  const source = fs.readFileSync(runtimeFlowManifestPath, "utf8");
  const retiredRuntimeFlowKeys = [
    "flow:online_order.transition",
    "flow:supplier.invoice.create",
    "flow:supplier.payment.create",
    "flow:purchase.create",
    "flow:purchase.receive",
    "flow:supplier.return.execute",
  ];
  for (const key of retiredRuntimeFlowKeys) {
    if (source.includes(`flow("${key}"`) || source.includes(`flow('${key}'`)) {
      findings.push({ type: "RETIRED_DUPLICATE_RUNTIME_FLOW", key, file: "server/metadata/manifests" });
    }
  }
}

// GPT Builder must preserve imported runtime actions rather than flattening
// metadata into hardcoded UI defaults.
const builderPage = read("src/pages/developer/gptbuilder/GPTBuilderPage.jsx");
const builderAction = read("src/pages/developer/gptbuilder/GPTBuilderAction.jsx");
const builderRoundTripReady =
  /source:\s*['"]metadata_import['"]/.test(builderPage)
  && /importedMetadataAction\s*:\s*runtimeAction/.test(builderPage)
  && /Imported metadata configuration/.test(builderAction);
if (!builderRoundTripReady) findings.push({ type: "GPT_BUILDER_RUNTIME_ROUNDTRIP_FALLBACK_MISSING" });

const report = {
  generatedAt: new Date().toISOString(),
  purpose: "Verify metadata-owned workflow inventory and canonical runtime mediation without source-defined business workflow authorities.",
  summary: {
    packageWorkflows: packageWorkflows.length,
    systemWorkflows: systemWorkflows.length,
    runtimeWorkflows: runtimeWorkflows.length,
    globalBusinessCommandGateway: globalGatewayEnabled,
    builderRoundTripFallback: builderRoundTripReady,
    totalGaps: findings.length,
  },
  runtimeWorkflowInventory: runtimeWorkflows.map((workflow) => ({
    source: workflow.source,
    name: workflow.name,
    apiName: workflow.apiName,
    flowType: workflow.flowType,
    steps: workflow.actions.length,
  })),
  findings,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "workflow-coverage-audit.json"), JSON.stringify(report, null, 2) + "\n");

if (findings.length) {
  console.error(`Workflow coverage audit found ${findings.length} gap(s).`);
  for (const finding of findings) {
    console.error(`- ${finding.type}${finding.file ? `: ${finding.file}` : ""}${finding.line ? `:${finding.line}` : ""}${finding.name ? ` [${finding.name}]` : ""}`);
  }
  if (ENFORCE) process.exit(1);
} else {
  console.log(`Workflow coverage audit passed: ${runtimeWorkflows.length} metadata-owned runtime workflow(s), canonical mediation intact.`);
}
