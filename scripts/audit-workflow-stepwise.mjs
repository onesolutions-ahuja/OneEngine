import { packageDefinitions } from "../server/services/packageRegistry.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const atomicAllowlist = new Set([
  "Staff - Set Active Status",
]);

const rows = [];
const add = ({ source, packageKey = null, name, apiName = null, action = {}, runtime = true }) => {
  const actions = Array.isArray(action?.actions) ? action.actions : [];
  const nodes = Array.isArray(action?.gptBuilderElements) ? action.gptBuilderElements : [];
  rows.push({
    source,
    packageKey,
    name: name || apiName || "(unnamed)",
    apiName,
    runtime,
    steps: actions.length,
    builderNodes: nodes.length,
    builderRoundTrip: !runtime || actions.length === 0 || nodes.length === actions.length,
    atomicAllowed: atomicAllowlist.has(name || apiName || ""),
  });
};

for (const pkg of packageDefinitions()) {
  const manifest = pkg?.manifest || pkg || {};
  const packageKey = pkg?.packageKey || pkg?.package_key || pkg?.key || manifest?.packageKey || manifest?.key || null;
  for (const workflow of manifest.workflows || []) {
    const action = workflow?.action || workflow || {};
    add({
      source: "package",
      packageKey,
      name: workflow?.name || workflow?.label || workflow?.key,
      apiName: workflow?.apiName || action?.apiName || null,
      action,
      runtime: String(action?.flowType || "").toUpperCase() !== "KIOSK_EXPERIENCE",
    });
  }
}

for (const workflow of systemWorkflowDefinitions()) {
  add({
    source: "system",
    name: workflow?.name,
    apiName: workflow?.action?.apiName || workflow?.systemKey || null,
    action: workflow?.action || {},
    runtime: true,
  });
}

const runtimeRows = rows.filter((row) => row.runtime);
const short = runtimeRows.filter((row) => row.steps <= 2);
const invalidShort = short.filter((row) => !row.atomicAllowed);
const nonBuilder = runtimeRows.filter((row) => row.steps > 0 && !row.builderRoundTrip);
const zeroStep = runtimeRows.filter((row) => row.steps === 0);

const report = {
  totalDefinitions: rows.length,
  runtimeWorkflows: runtimeRows.length,
  shortRuntimeWorkflows: short.length,
  invalidShortRuntimeWorkflows: invalidShort.length,
  zeroStepRuntimeWorkflows: zeroStep.length,
  nonBuilderRoundTripRuntimeWorkflows: nonBuilder.length,
  short,
  invalidShort,
  zeroStep,
  nonBuilder,
};

console.log(JSON.stringify(report, null, 2));
if (process.argv.includes("--enforce")) {
  if (invalidShort.length || zeroStep.length || nonBuilder.length) process.exit(1);
}
