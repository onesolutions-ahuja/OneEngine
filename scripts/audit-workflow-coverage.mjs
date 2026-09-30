import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = path.join(ROOT, 'server')
const OUT = path.join(ROOT, 'artifacts')
const ENFORCE = process.argv.includes('--enforce')

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(full) : /\.(?:js|mjs)$/.test(entry.name) ? [full] : []
})
const uniq = (items) => [...new Set(items)]
const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/')

function extractKeys(text, pattern) {
  return uniq([...text.matchAll(pattern)].map((match) => match[1]).filter(Boolean))
}

function routeBlocks(file, text) {
  const matches = [...text.matchAll(/\b(?:router|app)\.(post|put|patch|delete)\s*\(\s*(["'`])([^"'`]+)\2/g)]
  return matches.map((match, index) => {
    const start = match.index
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length
    const body = text.slice(start, end)
    const method = match[1].toUpperCase()
    const route = match[3]
    const createsRun = /\bcreateWorkflowRun\s*\(/.test(body)
    const executesWorkflow = /\bexecuteWorkflowActions?\s*\(/.test(body)
    const executesSystemWorkflow = /\bexecuteSystemWorkflow\s*\(/.test(body)
    const executesRegisteredAction = /\bexecuteRegisteredAction\s*\(/.test(body)
    const invokesFunctionRegistry = /\b(?:getRegisteredFunction|executePlatformFunction|CALL_FUNCTION)\b/.test(body)
    return {
      file: rel(file),
      method,
      route,
      workflowMediated: executesSystemWorkflow || (createsRun && executesWorkflow),
      createsRun,
      executesWorkflow,
      executesSystemWorkflow,
      executesRegisteredAction,
      invokesFunctionRegistry,
    }
  })
}

const functionRegistry = read('server/services/platformFunctionRegistry.js')
const workflowRuntime = read('server/services/platformWorkflow.js')
const trustedRuntime = read('server/services/trustedRuntime.js')
const actionRegistry = read('server/services/platformActionRegistry.js')
const systemWorkflowCatalog = read('server/services/systemWorkflowCatalog.js')

const functions = extractKeys(functionRegistry, /\bkey:\s*"([^"]+)"/g)
const workflowActions = extractKeys(workflowRuntime, /\bkey:\s*"([A-Z0-9_]+)"/g)
const coreActions = extractKeys(actionRegistry, /\bkey:\s*"([A-Z0-9_]+)"/g)
const actions = uniq([...coreActions, ...workflowActions])
const jobsSection = trustedRuntime.match(/TRUSTED_JOB_KINDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/)?.[1] || ''
const jobs = extractKeys(jobsSection, /"([A-Z0-9_]+)"/g)

const mutationRoutes = []
for (const file of [path.join(SERVER, 'server.js'), ...walk(path.join(SERVER, 'routes'))]) {
  mutationRoutes.push(...routeBlocks(file, fs.readFileSync(file, 'utf8')))
}

const bypassRoutes = mutationRoutes.filter((route) => !route.workflowMediated)
const mediatedRoutes = mutationRoutes.filter((route) => route.workflowMediated)

const directRuntimeCalls = []
for (const file of walk(SERVER)) {
  const text = fs.readFileSync(file, 'utf8')
  if (rel(file) === 'server/services/platformWorkflow.js') continue
  for (const [label, re] of [
    ['executeWorkflowAction', /\bexecuteWorkflowAction\s*\(/g],
    ['executeRegisteredAction', /\bexecuteRegisteredAction\s*\(/g],
  ]) {
    for (const match of text.matchAll(re)) {
      directRuntimeCalls.push({ file: rel(file), line: text.slice(0, match.index).split('\n').length, call: label })
    }
  }
}

const catalogueCoverage = {
  functions: /PLATFORM_FUNCTIONS\.map\s*\(/.test(systemWorkflowCatalog),
  actions: /PLATFORM_ACTION_REGISTRY[\s\S]*\.map\s*\(/.test(systemWorkflowCatalog),
  jobs: /TRUSTED_JOB_KINDS\.map\s*\(/.test(systemWorkflowCatalog),
}

const findings = [
  ...(!catalogueCoverage.functions ? functions.map((key) => ({ severity: 'GAP', type: 'FUNCTION_REQUIRES_SYSTEM_WORKFLOW', key })) : []),
  ...(!catalogueCoverage.actions ? actions.map((key) => ({ severity: 'GAP', type: 'ACTION_REQUIRES_SYSTEM_WORKFLOW', key })) : []),
  ...(!catalogueCoverage.jobs ? jobs.map((key) => ({ severity: 'GAP', type: 'JOB_TRIGGER_REQUIRES_WORKFLOW', key })) : []),
  ...directRuntimeCalls.map((call) => ({ severity: 'GAP', type: 'DIRECT_RUNTIME_CALL_BYPASS', ...call })),
  ...bypassRoutes.map((route) => ({ severity: 'GAP', type: 'MUTATION_ROUTE_NOT_WORKFLOW_MEDIATED', ...route })),
]

const report = {
  phase: 1,
  purpose: 'Inventory every executable OneEngine surface before migration to mandatory workflow-mediated execution.',
  generatedAt: new Date().toISOString(),
  summary: {
    registeredFunctions: functions.length,
    registeredActions: actions.length,
    trustedJobKinds: jobs.length,
    mutationRoutes: mutationRoutes.length,
    workflowMediatedMutationRoutes: mediatedRoutes.length,
    bypassMutationRoutes: bypassRoutes.length,
    directRuntimeCallSites: directRuntimeCalls.length,
    catalogueFunctionsCovered: catalogueCoverage.functions,
    catalogueActionsCovered: catalogueCoverage.actions,
    catalogueJobsCovered: catalogueCoverage.jobs,
    totalGaps: findings.length,
  },
  registeredFunctions: functions,
  registeredActions: actions,
  trustedJobKinds: jobs,
  mutationRoutes,
  directRuntimeCalls,
  findings,
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'workflow-coverage-audit.json'), JSON.stringify(report, null, 2) + '\n')

const md = [
  '# Workflow Coverage Audit — Phase 1',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '## Summary',
  '',
  `- Registered functions: ${report.summary.registeredFunctions}`,
  `- Registered actions: ${report.summary.registeredActions}`,
  `- Trusted job kinds: ${report.summary.trustedJobKinds}`,
  `- Mutation routes: ${report.summary.mutationRoutes}`,
  `- Workflow-mediated mutation routes: ${report.summary.workflowMediatedMutationRoutes}`,
  `- Mutation-route bypass candidates: ${report.summary.bypassMutationRoutes}`,
  `- Direct runtime call sites: ${report.summary.directRuntimeCallSites}`,
  '',
  'Phase 1 is inventory only. Phase 2+ will create canonical system workflows and remove each bypass.',
  '',
].join('\n')
fs.writeFileSync(path.join(OUT, 'workflow-coverage-audit.md'), md + '\n')

console.log(JSON.stringify(report.summary, null, 2))
if (ENFORCE && findings.length) {
  console.error(`Workflow coverage enforcement failed with ${findings.length} gap(s).`)
  process.exit(1)
}
