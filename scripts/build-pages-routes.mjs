import fs from 'node:fs/promises'
import path from 'node:path'

// GitHub Pages cannot rewrite SPA document requests to index.html with HTTP
// 200. Publish entry points for the router's fixed paths instead. Application
// routing and authorization remain unchanged; dynamic record URLs retain the
// existing 404 fallback.
const source = await fs.readFile('src/navigation/routes.js', 'utf8')
const html = await fs.readFile('dist/index.html', 'utf8')
const routes = new Set([...source.matchAll(/parts\[0\] === '([a-z-]+)'/g)].map(match => match[1]))
const developerKeys = source.match(/DEVELOPER_SETTINGS_KEYS = new Set\(\[([\s\S]*?)\]\)/)?.[1]
if (!routes.has('dashboard') || !developerKeys) throw new Error('Unable to read fixed application routes')
for (const match of developerKeys.matchAll(/'([a-z-]+)'/g)) {
  routes.add(`developer/${match[1]}`)
  routes.add(`settings/${match[1]}`)
}
for (const route of routes) {
  const directory = path.join('dist', route)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'index.html'), html)
}
await fs.writeFile('dist/404.html', html)
console.log(`Published ${routes.size} fixed GitHub Pages route entry points`)
