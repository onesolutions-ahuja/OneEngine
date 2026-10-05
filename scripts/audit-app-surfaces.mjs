import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { internalAppCatalog } from '../server/services/internalAppCatalog.js'
import { packageDefinitions } from '../server/services/packageRegistry.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const errors = []
const assert = (condition, message) => { if (!condition) errors.push(message) }

const app = read('src/App.jsx')
const shell = read('src/components/shell/DesktopShell.jsx')
const runtimeSurface = read('src/components/shell/DesktopRuntimeSurface.jsx')
const store = read('src/pages/oneStore/OneStorePopover.jsx')
const shared = read('src/utils/appMarketplace.js')

for (const [file, source] of [['src/components/shell/DesktopShell.jsx', shell], ['src/pages/oneStore/OneStorePopover.jsx', store]]) {
  assert(source.includes("from './utils/appMarketplace'") || source.includes("from '../../utils/appMarketplace'"),
    `${file}: must use shared appMarketplace utilities`)
}

for (const forbidden of ['MARKETPLACE_BRAND_MATCHES', 'MARKETPLACE_ICON_ALIASES', 'function marketplaceIcon(', 'function appIcon(', 'DEDICATED_OPEN_ROUTES=']) {
  assert(!shell.includes(forbidden), `src/components/shell/DesktopShell.jsx: duplicate marketplace logic remains: ${forbidden}`)
  assert(!app.includes(forbidden), `src/App.jsx: duplicate marketplace logic remains: ${forbidden}`)
  assert(!store.includes(forbidden), `OneStorePopover.jsx: duplicate marketplace logic remains: ${forbidden}`)
}

assert(shell.includes('appIconUrl(item)'), 'Search/Launcher must use shared appIconUrl')
assert(shell.includes('resolveAppOpenRoute(item)'), 'Search/Launcher must use shared resolveAppOpenRoute')
assert(shell.includes('readMarketplaceCache()'), 'Search/Launcher must recover from shared marketplace cache')
assert(shell.includes('storeAppsError'), 'Search/Launcher must expose catalogue fetch failures')
assert(store.includes('appIconUrl(item)'), 'oneStore must use shared appIconUrl')
assert(store.includes('resolveAppOpenRoute(selected)'), 'oneStore must use shared resolveAppOpenRoute')
assert(store.includes('readMarketplaceCache()'), 'oneStore must recover from shared marketplace cache')
assert(store.includes('Retry'), 'oneStore must expose retry after catalogue failure')

assert(exists('public/icons/apps/default-app.svg'), 'Missing public default app icon')
assert(exists('public/icons/apps/onestore.svg'), 'Missing oneStore icon')

const aliasMatch = shared.match(/const ICON_ALIASES = Object\.freeze\(\{([\s\S]*?)\}\)/)
assert(Boolean(aliasMatch), 'Unable to inspect ICON_ALIASES')
if (aliasMatch) {
  const assets = [...aliasMatch[1].matchAll(/:\s*'([a-z0-9-]+)'/g)].map((match) => match[1])
  for (const asset of new Set(assets)) {
    assert(exists(`public/icons/apps/${asset}.svg`), `ICON_ALIASES points to missing asset: ${asset}.svg`)
  }
}

const supportedRoutes = new Set([...runtimeSurface.matchAll(/activeApp\s*===\s*'([^']+)'/g)].map((m) => m[1]))
supportedRoutes.add('settings')
supportedRoutes.add('developer')
supportedRoutes.add('integrations')

const publicApps = internalAppCatalog.filter((entry) =>
  entry.visibility !== 'HIDDEN' &&
  entry.systemOnly !== true &&
  entry.packageType !== 'FOUNDATION'
)

const packageByModule = new Map(packageDefinitions().map((definition) => [definition.moduleKey, definition]))
for (const entry of internalAppCatalog) {
  const definition = packageByModule.get(entry.key)
  assert(Boolean(definition), `${entry.key}: missing generated package definition`)
  if (!definition) continue
  assert(definition.packageKey === (entry.packageKey || entry.key), `${entry.key}: package key drift`)
  assert(definition.manifest.route === entry.route, `${entry.key}: package route drift`)
  assert(definition.manifest.storeScoped === (entry.storeScoped === true), `${entry.key}: store scope drift`)
  assert(definition.manifest.entitlementKey === (entry.entitlementKey || definition.manifest.entitlementKey), `${entry.key}: entitlement drift`)
  const expectedPermissions = new Set(entry.permissions || [])
  const actualPermissions = new Set(definition.manifest.permissions || [])
  for (const permission of expectedPermissions) {
    assert(actualPermissions.has(permission), `${entry.key}: package missing permission ${permission}`)
  }
  const expectedDependencies = (entry.dependencies || []).map((dependency) =>
    typeof dependency === 'string' ? dependency : dependency.packageKey || dependency.package_key
  )
  const actualDependencies = (definition.manifest.dependencies || []).map((dependency) =>
    typeof dependency === 'string' ? dependency : dependency.packageKey || dependency.package_key
  )
  for (const dependency of expectedDependencies) {
    assert(actualDependencies.includes(dependency), `${entry.key}: package missing dependency ${dependency}`)
  }
  if (entry.connectorApp) {
    for (const permission of ['connector.test', 'connector.view', 'connector.manage']) {
      assert(actualPermissions.has(permission), `${entry.key}: connector package missing derived permission ${permission}`)
    }
    for (const capability of entry.connectorApp.capabilities || []) {
      for (const permission of capability.requiredPermissions || []) {
        assert(actualPermissions.has(permission), `${entry.key}: connector capability ${capability.key} missing permission ${permission}`)
      }
    }
  }
}

for (const entry of publicApps) {
  const route = String(entry.route || '/app/integrations')
  assert(route.startsWith('/app/'), `${entry.key}: route must start /app/: ${route}`)
  assert(!route.startsWith('/app/custom/'), `${entry.key}: stale /app/custom route: ${route}`)
  const slug = route.split('/').filter(Boolean)[1]
  assert(supportedRoutes.has(slug), `${entry.key}: route has no rendered app surface: ${route}`)
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  return entry.isDirectory() ? walk(full) : [full]
})
for (const full of walk(path.join(root, 'src')).filter((p) => /\.(js|jsx|ts|tsx)$/.test(p))) {
  const source = fs.readFileSync(full, 'utf8')
  for (const match of source.matchAll(/\/icons\/apps\/([a-z0-9-]+)\.svg/g)) {
    assert(exists(`public/icons/apps/${match[1]}.svg`), `${path.relative(root, full)} references missing icon ${match[1]}.svg`)
  }
  assert(!source.includes('/smart-theme/'), `${path.relative(root, full)} contains stale /smart-theme/ runtime path`)
}

assert(!read('vite.config.js').includes("'/smart-theme/'"), 'vite.config.js contains stale smart-theme base')

if (errors.length) {
  console.error('\nApp surface audit FAILED:')
  for (const error of errors) console.error(` - ${error}`)
  process.exit(1)
}

console.log(`App surface audit passed: ${publicApps.length} public apps, shared search/launcher/oneStore icon + route handling verified.`)
