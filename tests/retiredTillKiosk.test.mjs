import test from 'node:test'
import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

async function walk(root) {
  const rows = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) rows.push(...await walk(full))
    else rows.push(full)
  }
  return rows
}

test('retired OneTill and OneKiosk page surfaces cannot silently return', async () => {
  const missing = [
    'src/pages/till/TillPage.jsx',
    'src/pages/till/CustomerDisplay.jsx',
    'src/pages/kiosk/OneKioskPage.jsx',
    'src/pages/kiosk/OneKioskDisplayPage.jsx',
    'tests/e2e/onekiosk.spec.mjs',
    'public/icons/onetill.svg',
    'public/icons/apps/onetill-new.svg',
    'public/icons/apps/onetill-dock-clean.svg',
  ]
  for (const target of missing) {
    let exists = true
    try { await access(target) } catch { exists = false }
    assert.equal(exists, false, target + ' must stay retired')
  }
})

test('runtime source has no retired OneTill/OneKiosk app routes, package keys, or kiosk auth modes', async () => {
  const roots = ['src', 'server']
  const patterns = [
    /\bOneTill\b/,
    /\bOneKiosk\b/,
    /\bone_kiosk\b/,
    /kiosk-runtime/,
    /kiosk-display/,
    /pages\/till\/TillPage/,
    /pages\/kiosk\/OneKiosk/,
  ]
  const offenders = []
  for (const root of roots) {
    for (const file of await walk(root)) {
      if (!/\.(?:js|jsx|mjs|json|sql)$/.test(file)) continue
      const source = await readFile(file, 'utf8')
      for (const pattern of patterns) {
        if (pattern.test(source)) offenders.push(`${file}: ${pattern}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

test('generic retail metadata remains page-neutral after the retired app removal', async () => {
  const manifest = await readFile('server/metadata/manifests/retail_pos.json', 'utf8')
  assert.doesNotMatch(manifest, /OneTill|OneKiosk|one_kiosk/)
  assert.match(manifest, /Retail POS/)
})
