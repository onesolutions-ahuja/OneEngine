import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageDefinitions } from '../server/services/packageRegistry.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))
const errors = []
const assert = (condition, message) => { if (!condition) errors.push(message) }

const app = read('src/App.jsx')
const store = read('src/pages/oneStore/OneStorePopover.jsx')
const shared = read('src/utils/appMarketplace.js')

for (const [file, source] of [['src/App.jsx', app], ['src/pages/oneStore/OneStorePopover.jsx', store]]) {
  assert(source.includes("from './utils/appMarketplace'") || source.includes("from '../../utils/appMarketplace'"),
    `${file}: must use shared appMarketplace utilities`)
}

for (const forbidden of ['MARKETPLACE_BRAND_MATCHES', 'MARKETPLACE_ICON_ALIASES', 'function marketplaceIcon(', 'function appIcon(', 'DEDICATED_OPEN_ROUTES=']) {
  assert(!app.includes(forbidden), `src/App.jsx: duplicate marketplace logic remains: ${forbidden}`)
  assert(!store.includes(forbidden), `OneStorePopover.jsx: duplicate marketplace logic remains: ${forbidden}`)
}

assert(app.includes('appIconUrl(item)'), 'Search/Launcher must use shared appIconUrl')
assert(app.includes('resolveAppOpenRoute(item)'), 'Search/Launcher must use shared resolveAppOpenRoute')
assert(app.includes('readMarketplaceCache()'), 'Search/Launcher must recover from shared marketplace cache')
assert(app.includes('storeAppsError'), 'Search/Launcher must expose catalogue fetch failures')
assert(store.includes('appIconUrl(item)'), 'oneStore must use shared appIconUrl')
assert(store.includes('resolveAppOpenRoute(selected)'), 'oneStore must use shared resolveAppOpenRoute')
assert(store.includes('readMarketplaceCache()'), 'oneStore must recover from shared marketplace cache')
assert(store.includes('Retry'), 'oneStore must expose retry after catalogue failure')

assert(exists('public/icons/apps/default-app.svg'), 'Missing public default app icon')
assert(exists('public/icons/apps/onestore.svg'), 'Missing oneStore icon')

// App icons are metadata-owned. The shared marketplace helper must not
// reintroduce a hardcoded package/icon alias table; explicit manifest assets
// and the default icon are validated below through source references.
assert(!shared.includes('ICON_ALIASES'), 'appMarketplace must not contain hardcoded ICON_ALIASES')

const supportedRoutes = new Set([...app.matchAll(/activeApp\s*===\s*'([^']+)'/g)].map((m) => m[1]))
supportedRoutes.add('settings')
supportedRoutes.add('developer')
supportedRoutes.add('integrations')
// Generic metadata-owned app surfaces are resolved by openRoutePath/readRoute
// into WorkspacePage rather than a business-specific activeApp branch.
supportedRoutes.add('objects')
supportedRoutes.add('workspace')

const definitions = packageDefinitions()
const publicApps = definitions.filter((definition) => {
  const manifest = definition?.manifest || {}
  return manifest.visibility !== 'HIDDEN'
    && manifest.systemOnly !== true
    && manifest.packageType !== 'FOUNDATION'
})

assert(definitions.length > 0, 'Package definition catalogue must not be empty')
assert(publicApps.length > 0, 'App surface audit cannot pass with zero public package apps')

for (const definition of definitions) {
  const manifest = definition?.manifest || {}
  assert(Boolean(definition.packageKey), 'Package definition missing packageKey')
  assert(Boolean(manifest.packageKey), `${definition.packageKey}: manifest packageKey missing`)
  assert(manifest.packageKey === definition.packageKey, `${definition.packageKey}: manifest package key drift`)
  const permissions = new Set(manifest.permissions || [])
  if (manifest.connectorApp) {
    for (const permission of ['connector.test', 'connector.view', 'connector.manage']) {
      assert(permissions.has(permission), `${definition.packageKey}: connector package missing derived permission ${permission}`)
    }
    for (const capability of manifest.connectorApp.capabilities || []) {
      for (const permission of capability.requiredPermissions || []) {
        assert(permissions.has(permission), `${definition.packageKey}: connector capability ${capability.key} missing permission ${permission}`)
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

const developer = read('src/pages/developer/OneDeveloperPage.jsx')
const routes = read('src/navigation/routes.js')
const gptAppBuilder = read('src/pages/developer/gptappbuilder/GPTAppBuilderPage.jsx')
for (const retired of ['src/pages/settings/Platform/PackageBuilderAdmin.jsx', 'src/pages/settings/Platform/PlatformAppsAdmin.jsx']) {
  assert(!exists(retired), `Retired legacy app builder still exists: ${retired}`)
}
assert(!developer.includes('PackageBuilderAdmin'), 'OneDeveloper must not import the retired Package Builder')
assert(!developer.includes("key: 'platform-apps'"), 'OneDeveloper must not expose the retired platform-apps section')
assert(routes.includes("requestedSection === 'platform-apps' ? 'gptappbuilder'"), 'Legacy platform-apps route must redirect to GPTAppBuilder')
assert(gptAppBuilder.includes('/api/superadmin/packages/register-portable'), 'GPTAppBuilder publish must use generic portable package registration')
assert(gptAppBuilder.includes('/api/superadmin/packages/releases'), 'GPTAppBuilder publish must use the generic release lifecycle')

if (errors.length) {
  console.error('\nApp surface audit FAILED:')
  for (const error of errors) console.error(` - ${error}`)
  process.exit(1)
}

console.log(`App surface audit passed: ${publicApps.length} public apps, shared search/launcher/oneStore icon + route handling verified.`)
