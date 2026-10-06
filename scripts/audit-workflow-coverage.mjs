import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const findings = [
  ...executableDefaultFindings,
  ...directRuntimeCalls.map((call) => ({ severity: "GAP", type: "DIRECT_RUNTIME_CALL_BYPASS", ...call })),
  ...bypassRoutes.map((route) => ({ severity: "GAP", type: "MUTATION_ROUTE_NOT_WORKFLOW_MEDIATED", ...route })),
];

const report = {
  phase: 3,
  purpose: "Verify metadata-workflow mediation and identify mutation entry points that bypass the generic workflow runtime.",
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
    globalBusinessCommandGateway: globalGatewayEnabled,
    executableLiteralDefaults: executableDefaultFindings.length,
    totalGaps: findings.length,
  },
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
  `- Executable literal defaults: ${report.summary.executableLiteralDefaults}`,
  `- Total gaps: ${report.summary.totalGaps}`,
  "",
].join("\n");
fs.writeFileSync(path.join(OUT, "workflow-coverage-audit.md"), md + "\n");

console.log(JSON.stringify(report.summary, null, 2));
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
