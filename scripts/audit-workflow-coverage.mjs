import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageDefinitions } from "../server/services/packageRegistry.js";
import { systemWorkflowDefinitions } from "../server/services/systemWorkflowCatalog.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "server");
const OUT = path.join(ROOT, "artifacts");
const ENFORCE = process.argv.includes("--enforce");

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : /\.(?:js|mjs)$/.test(entry.name) ? [full] : [];
});
const uniq = (items) => [...new Set(items)];
const rel = (p) => path.relative(ROOT, p).replaceAll("\\", "/");

function extractKeys(text, pattern) {
  return uniq([...text.matchAll(pattern)].map((match) => match[1]).filter(Boolean));
}

function routeBlocks(file, text, globalGatewayEnabled = false) {
  const routerLevelAuth = /\brouter\.use\s*\(\s*(?:(?:"[^"]+"|'[^']+'|`[^`]+`)\s*,\s*)?authenticate\b/.test(text);
  const authAliases = [...text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\[([\s\S]*?)\]/g)]
    .filter((match) => /\bauthenticate\b/.test(match[2]))
    .map((match) => match[1]);
  const functionStarts = [...text.matchAll(/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const gatewayAliases = functionStarts
    .filter((match, index) => {
      const start = match.index;
      const nextFunction = index + 1 < functionStarts.length ? functionStarts[index + 1].index : text.length;
      const nextRoute = text.indexOf("\n  router.", start + 1);
      const end = nextRoute >= 0 && nextRoute < nextFunction ? nextRoute : nextFunction;
      return /ensureBusinessCommandRun/.test(text.slice(start, end));
    })
    .map((match) => match[1]);
  const matches = [...text.matchAll(/\b(?:router|app)\.(post|put|patch|delete)\s*\(\s*(["'`])([^"'`]+)\2/g)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    const body = text.slice(start, end);
    const method = match[1].toUpperCase();
    const route = match[3];
    const createsRun = /\bcreateWorkflowRun\s*\(/.test(body);
    const executesWorkflow = /\bexecuteWorkflowActions?\s*\(/.test(body);
    const executesSystemWorkflow = /\bexecuteSystemWorkflow\s*\(/.test(body);
    const executesRegisteredAction = /\bexecuteRegisteredAction\s*\(/.test(body);
    const ensuresBusinessCommand = /\bensureBusinessCommandRun\??\.\s*\(/.test(body);
    const invokesFunctionRegistry = /\b(?:getRegisteredFunction|executePlatformFunction|CALL_FUNCTION)\b/.test(body);
    const authenticated = routerLevelAuth
      || /\bauthenticate\b/.test(body)
      || authAliases.some((alias) => new RegExp("\\.\\.\\." + alias + "\\b|\\b" + alias + "\\b").test(body));
    const gatewayMediated = ensuresBusinessCommand
      || gatewayAliases.some((alias) => new RegExp("\\b" + alias + "\\b").test(body))
      || (/router\.handle\s*\(/.test(body) && /ensureBusinessCommandRun/.test(body));
    return {
      file: rel(file),
      method,
      route,
      workflowMediated: executesSystemWorkflow || gatewayMediated || (createsRun && executesWorkflow) || (globalGatewayEnabled && authenticated),
      createsRun,
      executesWorkflow,
      executesSystemWorkflow,
      executesRegisteredAction,
      ensuresBusinessCommand,
      gatewayMediated,
      invokesFunctionRegistry,
      authenticated,
      globalGatewayCovered: globalGatewayEnabled && authenticated,
    };
  });
}

const functionRegistry = read("server/services/platformFunctionRegistry.js");
const workflowRuntime = read("server/services/platformWorkflow.js");
const trustedRuntime = read("server/services/trustedRuntime.js");
const trustedJobKindsSource = fs.existsSync(path.join(ROOT, "server/services/trustedJobKinds.js"))
  ? read("server/services/trustedJobKinds.js")
  : trustedRuntime;
const actionRegistry = read("server/services/platformActionRegistry.js");
const systemWorkflowCatalog = read("server/services/systemWorkflowCatalog.js");

const runtimeFlowManifestsSource = read("server/packages/runtimeFlowManifests.js");
const platformMetadataSource = read("server/services/platformMetadata.js");
const platformWorkflowSource = read("server/services/platformWorkflow.js");
const gptBuilderPageSource = read("src/pages/developer/gptbuilder/GPTBuilderPage.jsx");
const gptBuilderActionSource = read("src/pages/developer/gptbuilder/GPTBuilderAction.jsx");

function extractTopLevelObjects(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return [];
  const arrayStart = text.indexOf("[", start);
  if (arrayStart < 0) return [];
  const objects = [];
  let objectStart = -1;
  let braceDepth = 0;
  let bracketDepth = 1;
  let parenDepth = 0;
  let quote = null;
  let escaped = false;
  for (let index = arrayStart + 1; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") { if (braceDepth === 0 && bracketDepth === 1 && parenDepth === 0) objectStart = index; braceDepth += 1; continue; }
    if (char === "}") { braceDepth -= 1; if (braceDepth === 0 && objectStart >= 0) { objects.push(text.slice(objectStart, index + 1)); objectStart = -1; } continue; }
    if (char === "[") bracketDepth += 1;
    else if (char === "]") { bracketDepth -= 1; if (bracketDepth === 0) break; }
    else if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
  }
  return objects;
}

function topLevelArrayItemCount(source, property = "actions") {
  const marker = property + ":";
  const propertyIndex = source.indexOf(marker);
  if (propertyIndex < 0) return 0;
  const start = source.indexOf("[", propertyIndex);
  if (start < 0) return 0;
  let braces = 0;
  let brackets = 1;
  let parens = 0;
  let quote = null;
  let escaped = false;
  let hasToken = false;
  let count = 0;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      hasToken = true;
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; hasToken = true; continue; }
    if (char === "{") { braces += 1; hasToken = true; continue; }
    if (char === "}") { braces -= 1; continue; }
    if (char === "[") { brackets += 1; hasToken = true; continue; }
    if (char === "]") {
      brackets -= 1;
      if (brackets === 0) { if (hasToken) count += 1; break; }
      continue;
    }
    if (char === "(") { parens += 1; hasToken = true; continue; }
    if (char === ")") { parens -= 1; continue; }
    if (char === "," && braces === 0 && brackets === 1 && parens === 0) {
      if (hasToken) count += 1;
      hasToken = false;
      continue;
    }
    if (!/\s/.test(char)) hasToken = true;
  }
  return count;
}

const packageRuntimeWorkflows = packageDefinitions()
  .flatMap((definition) => (definition.manifest?.workflows || []).map((workflow) => ({
    source: "package:" + definition.packageKey,
    name: workflow.name || workflow.label || workflow.key || "(unnamed)",
    apiName: workflow.apiName || workflow.action?.apiName || null,
    flowType: workflow.flowType || workflow.action?.flowType || null,
    actions: workflow.actions || workflow.action?.actions || [],
  })))
  .filter((workflow) => String(workflow.flowType || "").toUpperCase() !== "KIOSK_EXPERIENCE");

const systemRuntimeWorkflows = systemWorkflowDefinitions().map((workflow) => ({
  source: "system",
  name: workflow.name || workflow.systemKey,
  apiName: workflow.action?.apiName || workflow.systemKey || null,
  flowType: workflow.action?.flowType || null,
  actions: workflow.action?.actions || [],
}));

const metadataSeedWorkflows = [
  ...extractTopLevelObjects(platformMetadataSource, "const lifecycleFlows = [").map((block) => ({
    source: "platform-metadata:onestore",
    name: block.match(/name:\s*"([^"]+)"/)?.[1] || "(unnamed)",
    apiName: block.match(/buttonKey:\s*"([^"]+)"/)?.[1] || null,
    actions: Array.from({ length: topLevelArrayItemCount(block) }),
  })),
  ...extractTopLevelObjects(platformMetadataSource, "const tillWorkflowDefinitions = [").map((block) => ({
    source: "platform-metadata:onetill",
    name: block.match(/name:\s*"([^"]+)"/)?.[1] || "(unnamed)",
    apiName: block.match(/apiName:\s*"([^"]+)"/)?.[1] || null,
    actions: Array.from({ length: topLevelArrayItemCount(block) }),
  })),
];

const runtimeWorkflowInventory = [...packageRuntimeWorkflows, ...systemRuntimeWorkflows, ...metadataSeedWorkflows];
const allowedShortRuntimeWorkflows = new Set([
  "package:retail_pos::Open Drawer",
  "package:retail_pos::OneTill - Validate Stock",
  "package:retail_pos::OneTill - Age Verification",
  "package:staff::Staff - Set Active Status",
  "platform-metadata:onetill::OneTill - Open Drawer",
  "platform-metadata:onetill::OneTill - Receipt QR",
  "platform-metadata:onetill::OneTill - Receipt QR Policy",
  "platform-metadata:onetill::OneTill - Revoke Receipt QR",
]);
const shortRuntimeWorkflows = runtimeWorkflowInventory.filter((workflow) => workflow.actions.length <= 2);
const invalidShortRuntimeWorkflows = shortRuntimeWorkflows.filter((workflow) => !allowedShortRuntimeWorkflows.has(workflow.source + "::" + workflow.name));
const builderFallbackReady =
  /source:\s*'runtime_import'/.test(gptBuilderPageSource)
  && /importedRuntimeAction:\s*runtimeAction/.test(gptBuilderPageSource)
  && /Imported runtime configuration/.test(gptBuilderActionSource);
const retiredRuntimeFlowKeys = [
  "flow:online_order.transition",
  "flow:supplier.invoice.create",
  "flow:supplier.payment.create",
  "flow:purchase.create",
  "flow:purchase.receive",
  "flow:supplier.return.execute",
];
const residualRetiredRuntimeKeys = retiredRuntimeFlowKeys.filter((key) => runtimeFlowManifestsSource.includes(`flow("${key}"`));
const hardcodedLicenceRuntimePresent = /executeLicenceRequestPackageAction|LICENCE_REQUEST_PACKAGE|Licence Request Created/.test(platformWorkflowSource);

const workflowBuilderSource = read("src/pages/settings/Platform/WorkflowAdmin.jsx");
const forbiddenExecutableDefaults = [
  {
    key: "HARDCODED_EMAIL_RECIPIENT_DEFAULT",
    pattern: /recipient:\s*["'](?:record\.)?customer\.email["']/,
    file: "src/pages/settings/Platform/WorkflowAdmin.jsx",
  },
  {
    key: "HARDCODED_PHONE_RECIPIENT_DEFAULT",
    pattern: /recipient:\s*["'](?:record\.)?customer\.phone["']/,
    file: "src/pages/settings/Platform/WorkflowAdmin.jsx",
  },
  {
    key: "HARDCODED_SAMPLE_FUNCTION_INPUT",
    pattern: /inputs:\s*\{\s*value:\s*["']hello["']\s*\}/,
    file: "src/pages/settings/Platform/WorkflowAdmin.jsx",
  },
  {
    key: "HARDCODED_SCHEDULE_TIMEZONE_DEFAULT",
    pattern: /schedule:\s*\{[^}]*timezone:\s*["']Europe\/London["']/,
    file: "src/pages/settings/Platform/WorkflowAdmin.jsx",
  },
  {
    key: "HARDCODED_SCHEDULE_TIME_DEFAULT",
    pattern: /schedule:\s*\{[^}]*definition:\s*\{\s*time:\s*["']09:00["']/,
    file: "src/pages/settings/Platform/WorkflowAdmin.jsx",
  },
];

const executableDefaultFindings = forbiddenExecutableDefaults
  .filter((check) => check.pattern.test(workflowBuilderSource))
  .map((check) => ({
    severity: "GAP",
    type: "FLOW_EXECUTABLE_LITERAL_DEFAULT",
    key: check.key,
    file: check.file,
  }));


const functions = extractKeys(functionRegistry, /\bkey:\s*"([^"]+)"/g);
const workflowActions = extractKeys(workflowRuntime, /\bkey:\s*"([A-Z0-9_]+)"/g);
const coreActions = extractKeys(actionRegistry, /\bkey:\s*"([A-Z0-9_]+)"/g);
const actions = uniq([...coreActions, ...workflowActions]);
const jobsSection = trustedJobKindsSource.match(/TRUSTED_JOB_KINDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || "";
const jobs = extractKeys(jobsSection, /"([A-Z0-9_]+)"/g);

const serverSource = read("server/server.js");
const globalGatewayEnabled = /app\.use\("\/api",\s*createBusinessCommandGateway\(\{\s*db\s*\}\)\)/.test(serverSource);
const NON_MUTATING_POST_ROUTES = new Set([
  "/api/auth/login",
  "/customer-auth/login",
  "/client-web-shop/public/:slug/quote",
]);

// Authentication protocol endpoints intentionally mutate only identity/session
// state before a normal authenticated business command exists. They cannot be
// routed through the business workflow gateway because their purpose is to
// establish or elevate that authenticated session in the first place.
const IDENTITY_PROTOCOL_MUTATION_ROUTES = new Set([
  "/auth/mfa/totp/start",
  "/auth/mfa/totp/complete",
  "/auth/mfa/verify",
  "/auth/passkey/login/options",
  "/auth/passkey/login/verify",
  "/auth/mfa/passkey/registration-options",
  "/auth/mfa/passkey/registration-verify",
  "/auth/mfa/passkey/options",
  "/auth/mfa/passkey/verify",
  "/auth/passkey/login/options",
  "/auth/passkey/login/verify",
  "/auth/provider/:key/callback",
  "/auth/provider/:key/saml/acs",
]);

const allMutationVerbRoutes = [];
for (const file of [path.join(SERVER, "server.js"), ...walk(path.join(SERVER, "routes"))]) {
  allMutationVerbRoutes.push(...routeBlocks(file, fs.readFileSync(file, "utf8"), globalGatewayEnabled));
}
const ignoredNonMutatingPostRoutes = allMutationVerbRoutes.filter(
  (route) => route.method === "POST" && NON_MUTATING_POST_ROUTES.has(route.route)
);
const identityProtocolMutationRoutes = allMutationVerbRoutes.filter(
  (route) => IDENTITY_PROTOCOL_MUTATION_ROUTES.has(route.route)
);
const mutationRoutes = allMutationVerbRoutes.filter(
  (route) => !(route.method === "POST" && NON_MUTATING_POST_ROUTES.has(route.route))
    && !IDENTITY_PROTOCOL_MUTATION_ROUTES.has(route.route)
);
const bypassRoutes = mutationRoutes.filter((route) => !route.workflowMediated);
const mediatedRoutes = mutationRoutes.filter((route) => route.workflowMediated);

const directRuntimeCalls = [];
for (const file of walk(SERVER)) {
  const fileRel = rel(file);
  const text = fs.readFileSync(file, "utf8");
  if (fileRel === "server/services/platformWorkflow.js") continue;
  for (const [label, re] of [
    ["executeWorkflowAction", /\bexecuteWorkflowAction\s*\(/g],
    ["executeRegisteredAction", /\bexecuteRegisteredAction\s*\(/g],
  ]) {
    for (const match of text.matchAll(re)) {
      const lineStart = text.lastIndexOf("\n", match.index) + 1;
      const lineEnd = text.indexOf("\n", match.index);
      const lineText = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
      if (new RegExp("(?:export\\s+)?(?:async\\s+)?function\\s+" + label + "\\s*\\(").test(lineText)) continue;
      directRuntimeCalls.push({
        file: fileRel,
        line: text.slice(0, match.index).split("\n").length,
        call: label,
      });
    }
  }
}

const hiddenFunctionReferences = [];
for (const file of walk(SERVER)) {
  const fileRel = rel(file);
  const text = fs.readFileSync(file, "utf8");
  if (/\bCALL_FUNCTION\b/.test(text)) hiddenFunctionReferences.push({ file: fileRel, key: "CALL_FUNCTION" });
  if (/\bRUN_ASSISTANT_SUBFLOW\b/.test(text) && fileRel !== "server/database/init.js") hiddenFunctionReferences.push({ file: fileRel, key: "RUN_ASSISTANT_SUBFLOW" });
}

const catalogueCoverage = {
  functions: functions.length === 0,
  actions: !/function\s+actionWorkflow\s*\(|PLATFORM_ACTION_REGISTRY[\s\S]*\.map\s*\(/.test(systemWorkflowCatalog),
  jobs: !/function\s+jobWorkflow\s*\(|TRUSTED_JOB_KINDS\.map\s*\(/.test(systemWorkflowCatalog),
};

const findings = [
  ...executableDefaultFindings,
  ...functions.map((key) => ({ severity: "GAP", type: "LEGACY_FUNCTION_REGISTRY_NOT_EMPTY", key })),
  ...hiddenFunctionReferences.map((item) => ({ severity: "GAP", type: "HIDDEN_WORKFLOW_EXECUTOR_REFERENCE", ...item })),
  ...(!catalogueCoverage.actions ? [{ severity: "GAP", type: "ACTION_PSEUDO_WORKFLOW_GENERATOR_PRESENT" }] : []),
  ...(!catalogueCoverage.jobs ? [{ severity: "GAP", type: "JOB_PSEUDO_WORKFLOW_GENERATOR_PRESENT" }] : []),
  ...directRuntimeCalls.map((call) => ({ severity: "GAP", type: "DIRECT_RUNTIME_CALL_BYPASS", ...call })),
  ...bypassRoutes.map((route) => ({ severity: "GAP", type: "MUTATION_ROUTE_NOT_WORKFLOW_MEDIATED", ...route })),
  ...invalidShortRuntimeWorkflows.map((workflow) => ({ severity: "GAP", type: "COLLAPSED_RUNTIME_WORKFLOW", source: workflow.source, name: workflow.name, apiName: workflow.apiName, steps: workflow.actions.length })),
  ...residualRetiredRuntimeKeys.map((key) => ({ severity: "GAP", type: "RETIRED_DUPLICATE_RUNTIME_FLOW_RETURNED", key })),
  ...(!builderFallbackReady ? [{ severity: "GAP", type: "GPT_BUILDER_RUNTIME_ROUNDTRIP_FALLBACK_MISSING" }] : []),
  ...(hardcodedLicenceRuntimePresent ? [{ severity: "GAP", type: "HARDCODED_LICENCE_REQUEST_RUNTIME_RETURNED" }] : []),
];

const report = {
  phase: 3,
  purpose: "Verify system-workflow coverage and identify remaining mutation entry points that still bypass workflow mediation.",
  generatedAt: new Date().toISOString(),
  summary: {
    registeredFunctions: functions.length,
    registeredActions: actions.length,
    trustedJobKinds: jobs.length,
    mutationRoutes: mutationRoutes.length,
    ignoredNonMutatingPostRoutes: ignoredNonMutatingPostRoutes.length,
    workflowMediatedMutationRoutes: mediatedRoutes.length,
    bypassMutationRoutes: bypassRoutes.length,
    directRuntimeCallSites: directRuntimeCalls.length,
    catalogueFunctionsCovered: catalogueCoverage.functions,
    hiddenFunctionReferences: hiddenFunctionReferences.length,
    catalogueActionsCovered: catalogueCoverage.actions,
    catalogueJobsCovered: catalogueCoverage.jobs,
    globalBusinessCommandGateway: globalGatewayEnabled,
    executableLiteralDefaults: executableDefaultFindings.length,
    runtimeWorkflows: runtimeWorkflowInventory.length,
    shortRuntimeWorkflows: shortRuntimeWorkflows.length,
    invalidShortRuntimeWorkflows: invalidShortRuntimeWorkflows.length,
    builderRoundTripFallback: builderFallbackReady,
    retiredDuplicateRuntimeKeys: residualRetiredRuntimeKeys.length,
    hardcodedLicenceRuntime: hardcodedLicenceRuntimePresent,
    totalGaps: findings.length,
  },
  catalogueCoverage,
  registeredFunctions: functions,
  registeredActions: actions,
  trustedJobKinds: jobs,
  mutationRoutes,
  ignoredNonMutatingPostRoutes,
  directRuntimeCalls,
  findings,
};

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "workflow-coverage-audit.json"), JSON.stringify(report, null, 2) + "\n");

const md = [
  "# Workflow Coverage Audit",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Summary",
  "",
  `- Registered functions: ${report.summary.registeredFunctions}`,
  `- Registered actions: ${report.summary.registeredActions}`,
  `- Trusted job kinds: ${report.summary.trustedJobKinds}`,
  `- Mutation routes: ${report.summary.mutationRoutes}`,
  `- Workflow-mediated mutation routes: ${report.summary.workflowMediatedMutationRoutes}`,
  `- Mutation-route bypass candidates: ${report.summary.bypassMutationRoutes}`,
  `- Direct runtime call sites: ${report.summary.directRuntimeCallSites}`,
  `- Legacy function registry empty: ${report.summary.catalogueFunctionsCovered}`,
  `- Hidden function executor references: ${report.summary.hiddenFunctionReferences}`,
  `- Actions kept out of pseudo-workflow catalogue: ${report.summary.catalogueActionsCovered}`,
  `- Jobs kept out of pseudo-workflow catalogue: ${report.summary.catalogueJobsCovered}`,
  `- Executable literal defaults: ${report.summary.executableLiteralDefaults}`,
  `- Runtime workflows: ${report.summary.runtimeWorkflows}`,
  `- Runtime workflows with 0–2 steps: ${report.summary.shortRuntimeWorkflows}`,
  `- Invalid/collapsed 0–2-step workflows: ${report.summary.invalidShortRuntimeWorkflows}`,
  `- GPT Builder runtime round-trip fallback: ${report.summary.builderRoundTripFallback}`,
  `- Retired duplicate runtime keys present: ${report.summary.retiredDuplicateRuntimeKeys}`,
  `- Hardcoded licence-request runtime present: ${report.summary.hardcodedLicenceRuntime}`,
  `- Total gaps: ${report.summary.totalGaps}`,
  "",
].join("\n");
fs.writeFileSync(path.join(OUT, "workflow-coverage-audit.md"), md + "\n");

console.log(JSON.stringify(report.summary, null, 2));
if (hiddenFunctionReferences.length) console.log("HIDDEN_FUNCTION_REFERENCES=" + JSON.stringify(hiddenFunctionReferences));
if (directRuntimeCalls.length) console.log("DIRECT_RUNTIME_CALLS=" + JSON.stringify(directRuntimeCalls));
const bypassByFile = Object.entries(bypassRoutes.reduce((acc, route) => {
  acc[route.file] = (acc[route.file] || 0) + 1;
  return acc;
}, {})).sort((a, b) => b[1] - a[1]).slice(0, 25);
if (bypassByFile.length) console.log("TOP_BYPASS_FILES=" + JSON.stringify(bypassByFile));

if (ENFORCE && findings.length) {
  console.error(`Workflow coverage enforcement failed with ${findings.length} gap(s).`);
  process.exit(1);
}
