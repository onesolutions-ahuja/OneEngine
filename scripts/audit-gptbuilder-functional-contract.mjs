import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const fail = (message) => { console.error('GPT Builder functional contract audit failed:', message); process.exitCode = 1 }

const contract = JSON.parse(read('docs/gptbuilder-functional-acceptance-2026-10-05.json'))
const tests = read('tests/gptbuilderFunctionalContract.test.mjs')
const negativeTests = read('tests/gptbuilderNegativeRegression.test.mjs')

if (contract.frozen_through !== '2026-10-05') fail('frozen scope date changed')
if (!Array.isArray(contract.requirements) || !contract.requirements.length) fail('acceptance contract has no requirements')

const ids = contract.requirements.map((row) => row.id)
if (new Set(ids).size !== ids.length) fail('duplicate requirement IDs')
for (const row of contract.requirements) {
  if (!['PASS','FAIL','UNTESTED'].includes(row.status)) fail(row.id + ': invalid status ' + row.status)
  if (!tests.includes(JSON.stringify(row.id) + ':')) fail(row.id + ': missing executable coverage registration')
}
if (/\btest\.(?:skip|todo)\s*\(/.test(tests)) fail('skipped/todo contract tests are forbidden')
if (/describe\.(?:skip|todo)\s*\(/.test(tests)) fail('skipped/todo suites are forbidden')
if (/\.only\s*\(/.test(tests)) fail('focused .only tests are forbidden')
if (/\btest\.(?:skip|todo)\s*\(/.test(negativeTests)) fail('skipped/todo negative regression tests are forbidden')
if (/\.only\s*\(/.test(negativeTests)) fail('focused negative regression tests are forbidden')
for (const id of ['N001','N002','N003','N004','N005']) {
  if (!negativeTests.includes(id)) fail(id + ': missing explicit negative regression coverage')
}

const modes = [...tests.matchAll(/"mode":\s*"([^"]+)"/g)].map((match) => match[1])
const allowedModes = new Set(['static','integration','e2e','static+integration','gate'])
for (const mode of modes) if (!allowedModes.has(mode)) fail('unknown verification mode: ' + mode)

if (!process.exitCode) {
  console.log(JSON.stringify({
    status: 'PASS',
    frozenThrough: contract.frozen_through,
    requirements: ids.length,
    registered: modes.length,
    skippedTests: 0,
    focusedTests: 0
  }, null, 2))
}
