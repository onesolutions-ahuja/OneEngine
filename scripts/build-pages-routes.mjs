import fs from 'node:fs/promises'
import path from 'node:path'

// GitHub Pages cannot rewrite SPA document requests to index.html with HTTP
// 200. Publish entry points for the router's fixed paths instead. Application
// routing and authorization remain unchanged. Dynamic workspace/object URLs
// are emitted from the build's metadata seed catalogue below so direct loads
// also receive the SPA shell with HTTP 200.
const source = await fs.readFile('src/navigation/routes.js', 'utf8')
const appSource = await fs.readFile('src/App.jsx', 'utf8')
const packageCatalogSource = await fs.readFile('server/packages/packageManifestCatalog.js', 'utf8')
const bootstrapSources = await Promise.all([
  'server/services/platformBootstrap.js',
  'server/database/oneSolutionsSeeder.js',
  'server/database/init.js',
].map(async file => {
  try { return await fs.readFile(file, 'utf8') } catch { return '' }
}))
const html = await fs.readFile('dist/index.html', 'utf8')
const routes = new Set([...source.matchAll(/parts\[0\] === '([a-z-]+)'/g)].map(match => match[1]))

// Publish every concrete shell route the current runtime can mount. This keeps
// GitHub Pages document requests on HTTP 200 without maintaining a second,
 // business-specific route list in the deployment script.
for (const match of appSource.matchAll(/activeApp\s*===\s*'([a-z0-9-]+)'/g)) {
  const key = match[1]
  if (key && !['home'].includes(key)) routes.add(key)
}

// Installed apps are metadata-owned. Generate package-key aliases directly
// from the declarative package catalogue and include a URL-friendly hyphenated
// form for keys that use underscores.
for (const match of packageCatalogSource.matchAll(/^\s*(?:key|packageKey):\s*["']([a-z0-9_-]+)["']/gm)) {
  const key = match[1]
  if (!key) continue
  routes.add(key)
  routes.add(key.replaceAll('_', '-'))
}

// Workspace object routes are metadata-owned but still need physical Pages
// entry points because GitHub Pages has no rewrite-to-index facility. Derive
// object keys from metadata/bootstrap source rather than maintaining a
// business-specific deployment list.
const metadataSource = bootstrapSources.join('\n')
const objectKeys = new Set()
for (const match of metadataSource.matchAll(/(?:object_key|objectKey|api_name|apiName)\s*[:=]\s*["'`]([a-z][a-z0-9_]*)["'`]/g)) {
  objectKeys.add(match[1])
}
for (const key of objectKeys) {
  routes.add(`workspace/${key}`)
  routes.add(`objects/${key}`)
}
const developerKeys = source.match(/DEVELOPER_SETTINGS_KEYS\s*=\s*new Set\s*\(\s*\[([\s\S]*?)\]\s*\)/)?.[1]
const settingsVisualsStart = appSource.indexOf('const SETTINGS_VISUALS')
const settingsVisualsEnd = settingsVisualsStart >= 0 ? appSource.indexOf('\nfunction ', settingsVisualsStart) : -1
const settingsVisuals = settingsVisualsStart >= 0
  ? appSource.slice(settingsVisualsStart, settingsVisualsEnd > settingsVisualsStart ? settingsVisualsEnd : undefined)
  : ''
if (!routes.has('dashboard') || !developerKeys || !settingsVisuals) {
  throw new Error(`Unable to read fixed application routes (dashboard=${routes.has('dashboard')}, developerKeys=${Boolean(developerKeys)}, settingsVisuals=${Boolean(settingsVisuals)})`)
}
const developerSet = new Set([...developerKeys.matchAll(/'([a-z-]+)'/g)].map(match => match[1]))
for (const key of developerSet) {
  routes.add(`developer/${key}`)
  routes.add(`settings/${key}`)
}
// Keep legacy Developer URLs directly loadable on GitHub Pages. These aliases
// are normalized by readRoute() to their current builders.
for (const alias of ['workflow-builder', 'platform-apps', 'builder-2']) routes.add(`developer/${alias}`)
for (const match of settingsVisuals.matchAll(/^\s*(?:'([a-z-]+)'|([a-z-]+))\s*:/gm)) {
  const key = match[1] || match[2]
  if (!key || developerSet.has(key)) continue
  routes.add(`settings/${key}`)
}
for (const route of routes) {
  const directory = path.join('dist', route)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'index.html'), html)
}
await fs.writeFile('dist/404.html', html)
console.log(`Published ${routes.size} fixed GitHub Pages route entry points`)
