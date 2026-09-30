import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const API_FILE = path.join(SRC, 'services', 'api.js')
const RUNTIME_FILE = path.join(SRC, 'services', 'trustedRuntime.js')
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

const apiText = fs.readFileSync(API_FILE, 'utf8')
for (const required of ['isPrivilegedMutation', 'resolveTrustedCapability', 'UNREGISTERED_CAPABILITY']) {
  if (!apiText.includes(required)) {
    findings.push({ severity: 'ERROR', rule: 'API_GATE_MISSING', file: path.relative(ROOT, API_FILE), detail: required })
  }
}

const runtimeText = fs.readFileSync(RUNTIME_FILE, 'utf8')
for (const required of ['Object.freeze', 'TRUSTED_CAPABILITY_MAP', 'validateTrustedRuntime']) {
  if (!runtimeText.includes(required)) {
    findings.push({ severity: 'ERROR', rule: 'RUNTIME_MANIFEST_INVALID', file: path.relative(ROOT, RUNTIME_FILE), detail: required })
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  scannedFiles: walk(SRC).length,
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
console.log(`Trusted Runtime audit passed across ${report.scannedFiles} source files.`)
