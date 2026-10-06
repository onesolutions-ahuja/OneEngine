import fs from 'node:fs/promises'
import path from 'node:path'

// GitHub Pages cannot rewrite SPA document requests to index.html with HTTP
// 200. Publish entry points for the router's fixed paths instead. Application
// routing and authorization remain unchanged; dynamic record URLs retain the
// existing 404 fallback.
const source = await fs.readFile('src/navigation/routes.js', 'utf8')
const appSource = await fs.readFile('src/App.jsx', 'utf8')
const html = await fs.readFile('dist/index.html', 'utf8')
const routes = new Set([...source.matchAll(/parts\[0\] === '([a-z-]+)'/g)].map(match => match[1]))
const developerKeys = source.match(/DEVELOPER_SETTINGS_KEYS = new Set\(\[([\s\S]*?)\]\)/)?.[1]
const settingsVisuals = appSource.match(/const SETTINGS_VISUALS = \{([\s\S]*?)\n\}/)?.[1]
if (!routes.has('dashboard') || !developerKeys || !settingsVisuals) throw new Error('Unable to read fixed application routes')
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
