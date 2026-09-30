import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const API_FILE = path.join(SRC, 'services', 'api.js')
const RUNTIME_FILE = path.join(SRC, 'services', 'trustedRuntime.js')
const SERVER = path.join(ROOT, 'server')
const SERVER_ENTRY = path.join(SERVER, 'server.js')
const SERVER_RUNTIME = path.join(SERVER, 'services', 'trustedRuntime.js')
const SERVER_JOBS = path.join(SERVER, 'services', 'platformJobs.js')
const SERVER_PACKAGES = path.join(SERVER, 'services', 'trustedPackages.js')
const PACKAGE_ROUTES = path.join(SERVER, 'routes', 'packages.js')
const ALLOWED_FETCH_FILES = new Set([
  path.normalize(API_FILE),
  path.normalize(path.join(SRC, 'services', 'connectivity.js')),
])

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(?:js|jsx|mjs)$/.test(entry.name) ? [full] : []
  })
}

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length
}

const findings = []
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, 'utf8')
  const normal = path.normalize(file)

  if (!ALLOWED_FETCH_FILES.has(normal)) {
    for (const match of text.matchAll(/\bfetch\s*\(/g)) {
      findings.push({
        severity: 'ERROR',
        rule: 'DIRECT_FETCH_OUTSIDE_API_GATE',
        file: path.relative(ROOT, file),
        line: lineNumber(text, match.index),
      })
    }
  }

  for (const match of text.matchAll(/\b(?:eval|Function)\s*\(/g)) {
    findings.push({
      severity: 'ERROR',
      rule: 'DYNAMIC_CODE_EXECUTION',
      file: path.relative(ROOT, file),
      line: lineNumber(text, match.index),
    })
  }

  if (normal !== path.normalize(RUNTIME_FILE)) {
    for (const match of text.matchAll(/X-OneEngine-(?:Capability|Runtime)/g)) {
      findings.push({
        severity: 'ERROR',
        rule: 'TRUST_HEADER_OUTSIDE_RUNTIME',
        file: path.relative(ROOT, file),
        line: lineNumber(text, match.index),
      })
    }
  }
}

const serverEntry = fs.readFileSync(SERVER_ENTRY, 'utf8')
const serverRuntime = fs.readFileSync(SERVER_RUNTIME, 'utf8')
const serverJobs = fs.readFileSync(SERVER_JOBS, 'utf8')
const serverPackages = fs.readFileSync(SERVER_PACKAGES, 'utf8')
const packageRoutes = fs.readFileSync(PACKAGE_ROUTES, 'utf8')
for (const required of ['createTrustedRuntimeGate()', 'validateTrustedRuntime()', 'assertTrustedJobKind(job.kind)']) {
  if (!serverEntry.includes(required)) findings.push({ severity: 'ERROR', rule: 'SERVER_GATE_MISSING', file: path.relative(ROOT, SERVER_ENTRY), detail: required })
}
for (const required of ['PLATFORM_FUNCTIONS', 'PLATFORM_ACTION_REGISTRY', 'TRUSTED_JOB_KINDS', 'UNREGISTERED_CAPABILITY', 'prefixes: ["/api/platform/"]']) {
  if (!serverRuntime.includes(required)) findings.push({ severity: 'ERROR', rule: 'SERVER_RUNTIME_INVALID', file: path.relative(ROOT, SERVER_RUNTIME), detail: required })
}
if (!serverJobs.includes('assertTrustedJobKind(kind)')) {
  findings.push({ severity: 'ERROR', rule: 'JOB_ENQUEUE_GATE_MISSING', file: path.relative(ROOT, SERVER_JOBS) })
}
for (const required of ['internalAppCatalog', 'packageDefinition', 'hashPackageManifest', 'assertTrustedPackageManifest', 'validateTrustedPackageCatalogue', 'Object.freeze(Object.fromEntries']) {
  if (!serverPackages.includes(required)) findings.push({ severity: 'ERROR', rule: 'TRUSTED_PACKAGE_CATALOGUE_INVALID', file: path.relative(ROOT, SERVER_PACKAGES), detail: required })
}
const packageAssertions = (packageRoutes.match(/assertTrustedPackageManifest\(item\.packageKey, item\.manifest, item\.version\)/g) || []).length
if (packageAssertions < 3) {
  findings.push({ severity: 'ERROR', rule: 'PACKAGE_LIFECYCLE_GATE_MISSING', file: path.relative(ROOT, PACKAGE_ROUTES), detail: `expected plan/install/upgrade assertions; found ${packageAssertions}` })
}
if (!serverEntry.includes('validateTrustedPackageCatalogue()')) {
  findings.push({ severity: 'ERROR', rule: 'PACKAGE_STARTUP_VALIDATION_MISSING', file: path.relative(ROOT, SERVER_ENTRY) })
}

const apiText = fs.readFileSync(API_FILE, 'utf8')
for (const required of ['isPrivilegedMutation', 'resolveTrustedCapability', 'UNREGISTERED_CAPABILITY']) {
  if (!apiText.includes(required)) {
    findings.push({ severity: 'ERROR', rule: 'API_GATE_MISSING', file: path.relative(ROOT, API_FILE), detail: required })
  }
}

const runtimeText = fs.readFileSync(RUNTIME_FILE, 'utf8')
for (const required of ['Object.freeze', 'TRUSTED_CAPABILITY_MAP', 'validateTrustedRuntime', "prefixes: ['/api/platform/']"]) {
  if (!runtimeText.includes(required)) {
    findings.push({ severity: 'ERROR', rule: 'RUNTIME_MANIFEST_INVALID', file: path.relative(ROOT, RUNTIME_FILE), detail: required })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  scannedFiles: walk(SRC).length + walk(SERVER).length,
  errors: findings.filter((finding) => finding.severity === 'ERROR').length,
  findings,
}
fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'artifacts', 'trusted-runtime-audit.json'), JSON.stringify(report, null, 2) + '\n')

if (report.errors) {
  console.error(`Trusted Runtime audit failed with ${report.errors} finding(s).`)
  for (const finding of findings) console.error(`- ${finding.rule}: ${finding.file}${finding.line ? `:${finding.line}` : ''}`)
  process.exit(1)
}
console.log(`Trusted Runtime audit passed across ${report.scannedFiles} client/server source files.`)
