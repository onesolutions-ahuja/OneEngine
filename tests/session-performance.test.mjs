import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('desktop navigation does not force permission reloads for privileged apps', async () => {
  const source = await read('../src/App.jsx')
  assert.equal(source.includes("loadSessionPermissions({ force: requiresEnginePermission"), false)
  assert.match(source, /loadSessionPermissions\(\{ force: permissionRetry > 0/)
})

test('developer content is not blocked by client discovery', async () => {
  const source = await read('../src/pages/developer/OneDeveloperPage.jsx')
  assert.equal(source.includes('Resolving client context…'), false)
  assert.equal(source.includes("clientsLoading ? <div className=\"settings-state-card\""), false)
})

test('session bootstrap preserves cached context and hydrates permissions in one round trip', async () => {
  const client = await read('../src/services/api.js')
  const server = await read('../server/server.js')
  assert.match(client, /export function hasSessionContext\(\)/)
  assert.match(client, /if \(!force && hasSessionContext\(\)\) return existingCompanyId/)
  assert.match(server, /app\.get\("\/api\/auth\/bootstrap"/)
  assert.match(server, /permissions: \{ permissions \}/)
})

test('settings navigation uses its scoped session cache', async () => {
  const source = await read('../src/services/settings.js')
  assert.match(source, /loadSettingsContext\(\{ force = false \} = \{\}\)/)
  assert.match(source, /const cachedContext = !force \? readSettingsContextCache\(\) : null/)
  assert.match(source, /if \(cachedContext\) return cachedContext/)
})


test('shared API client deduplicates concurrent GET loaders by session context', async () => {
  const source = await read('../src/services/api.js')
  assert.match(source, /const apiRequestInFlight = new Map\(\)/)
  assert.match(source, /method === 'GET'.*options\.dedupe !== false/)
  assert.match(source, /apiRequestInFlight\.get\(key\)/)
})

test('login resolves central and tenant identity reads in parallel', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /const \[centralIdentity, tenantIdentity\] = await Promise\.all/)
  assert.equal(source.includes('const centralIdentity = await pool.query(identitySql'), false)
})

test('session bootstrap resolves identity and RBAC reads in parallel', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /const \[result, rolePermissions, permissionSets\] = await Promise\.all/)
})


test('per-request session security skips unused trusted-network lookup and parallelizes session state reads', async () => {
  const source = await read('../server/services/identitySecurity.js')
  assert.match(source, /includeTrustedNetwork = true/)
  assert.match(source, /includeTrustedNetwork: false/)
  assert.match(source, /const \[sessionResult, state\] = await Promise\.all/)
})

test('login RBAC permission reads run concurrently with security and Google preflight', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  assert.match(server, /const permissionsPromise = \(async \(\) =>/)
  assert.match(server, /const \[securityContext, googleRuntime, permissionBundle\] = await Promise\.all/)
  assert.match(server, /loadEffectivePermissionSets\(loginDb/)
  assert.match(server, /SELECT p\.code/)
  assert.equal(security.includes('AS permission_codes'), false)
})


test('login reuses one preloaded security context instead of re-querying settings and policy', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  const assurance = await read('../server/services/identityAssurance.js')
  assert.match(server, /loadLoginSecurityContext\(loginDb/)
  assert.match(server, /settingsOverride: securitySettings/)
  assert.match(server, /policyOverride: accessPolicy/)
  assert.match(server, /\{ settings: securitySettings, policy: accessPolicy \}/)
  assert.match(security, /export async function loadLoginSecurityContext/)
  assert.match(assurance, /settingsOverride !== undefined/)
})

test('Google Connect login readiness can reuse the bundled login preflight rows', async () => {
  const source = await read('../server/services/googleConnect.js')
  assert.match(source, /export async function resolveGoogleConnectPasswordLoginRuntime/)
  assert.match(source, /return resolveGoogleConnectPasswordLoginRuntime\(/)
})


test('password verification runs alongside all login preflight reads and records its own duration', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /const passwordCheckPromise = \(async \(\) =>/)
  assert.match(source, /const \[securityContext, googleRuntime, permissionBundle\] = await Promise\.all/)
  assert.match(source, /getGoogleConnectPasswordLoginRuntime\(loginDb/)
  assert.match(source, /const validPassword = await passwordCheckPromise/)
  assert.match(source, /loginTimings\.bcrypt_ms = bcryptDurationMs/)
})


test('login security preflight keeps the security-policy read compact', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  assert.match(server, /loadLoginSecurityContext\(loginDb/)
  assert.match(server, /security_preflight_ms/)
  assert.match(security, /export async function loadLoginSecurityContext/)
  const start = security.indexOf('export async function loadLoginSecurityContext')
  const end = security.indexOf('export async function registerFailedLogin', start)
  const preflight = security.slice(start, end)
  assert.equal(preflight.includes('package_registry'), false)
  assert.equal(preflight.includes('platform_permission_set_assignments'), false)
})

test('successful login finalization avoids a second session assurance update', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  assert.match(server, /assuranceLevel: effectiveAssurance\.passwordAssurance/)
  const loginStart = server.indexOf('app.post("/api/auth/login"')
  const loginEnd = server.indexOf('| CURRENT USER', loginStart)
  const loginSource = server.slice(loginStart, loginEnd > loginStart ? loginEnd : undefined)
  assert.equal(loginSource.includes('UPDATE identity_sessions SET assurance_level=$2'), false)
  assert.match(security, /INSERT INTO identity_sessions\(id,company_id,user_id,expires_at,ip_address,user_agent,auth_method,origin_host,assurance_level,assurance_verified_at\)/)
})


test('tracked session assurance parameter is explicitly typed for PostgreSQL', async () => {
  const source = await read('../server/services/identitySecurity.js')
  assert.match(source, /\$9::text,CASE WHEN \$9::text IS NULL/)
})


test('company entitlement sources are queried in parallel', async () => {
  const source = await read('../server/services/licensing.js')
  assert.match(source, /const bundleResultPromise = db\(/)
  assert.match(source, /const packageResultPromise = db\(/)
  assert.match(source, /const tierEntitlementsPromise = db\(/)
  assert.match(source, /const licensedPackageResultPromise = db\(/)
  assert.match(source, /const packageSourcesPromise = db\(/)
})

test('deployment smoke accepts ready health state', async () => {
  const source = await read('../.github/workflows/deployment-smoke.yml')
  assert.match(source, /status.*online\|ready/)
})


test('deployment smoke waits for the exact GitHub Pages commit instead of assuming fixed deploy time', async () => {
  const source = await read('../.github/workflows/deployment-smoke.yml')
  assert.match(source, /for attempt in \{1\.\.18\}/)
  assert.match(source, /if \[ "\$DEPLOYED_SHA" = "\$GITHUB_SHA" \]/)
})


test('automatic CI does not run competing live E2E suites against production', async () => {
  const playwright = await read('../.github/workflows/playwright-e2e.yml')
  const workflowBuilder = await read('../.github/workflows/workflow-builder-e2e.yml')
  const cypress = await read('../.github/workflows/cypress-deep-e2e.yml')
  const appointment = await read('../.github/workflows/appointment-debug.yml')
  const validate = await read('../.github/workflows/validate.yml')
  for (const source of [playwright, workflowBuilder, cypress, appointment]) {
    assert.match(source, /group: oneengine-live-e2e/)
    assert.match(source, /cancel-in-progress: false/)
  }
  assert.match(validate, /playwright-smoke:\n\s+if: github\.event_name == 'workflow_dispatch'/)
  assert.match(validate, /workflow-visual:\n\s+if: github\.event_name == 'workflow_dispatch'/)
})


test('successful password login finalizes session, security state, last-login and history in one database round trip', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  assert.match(server, /const sessionId = await finalizeSuccessfulLogin\(loginDb/)
  assert.match(security, /export async function finalizeSuccessfulLogin/)
  assert.match(security, /WITH new_session AS \(/)
  assert.match(security, /security_reset AS \(/)
  assert.match(security, /user_touch AS \(/)
  assert.match(security, /INSERT INTO identity_login_history/)
})


test('password login skips full Google entitlement resolution unless SSO could be authoritative', async () => {
  const server = await read('../server/server.js')
  const google = await read('../server/services/googleConnect.js')
  assert.match(server, /getGoogleConnectPasswordLoginRuntime\(loginDb/)
  assert.match(google, /export async function resolveGoogleConnectPasswordLoginRuntime/)
  assert.match(google, /if \(!packageRow \|\| !installed \|\| !enabled \|\| !configured\)/)
  const fastPath = google.slice(
    google.indexOf('export async function resolveGoogleConnectPasswordLoginRuntime'),
    google.indexOf('export async function getGoogleConnectPasswordLoginRuntime')
  )
  assert.ok(fastPath.indexOf('if (!packageRow || !installed || !enabled || !configured)') < fastPath.indexOf('getCompanyEntitlements'))
})


test('security governance connected-apps query avoids unsupported FULL OUTER JOIN with OR conditions', async () => {
  const source = await read('../server/routes/securityGovernance.js')
  const start = source.indexOf('router.get("/security/governance/connected-apps"')
  const end = source.indexOf('router.put("/security/governance/connected-apps/:appKey"', start)
  const route = source.slice(start, end)
  assert.equal(route.includes('FULL OUTER JOIN'), false)
  assert.match(route, /UNION ALL/)
  assert.match(route, /NOT EXISTS/)
})


test('live browser E2E workflows are manual-only to protect Render bandwidth quota', async () => {
  const playwright = await read('../.github/workflows/playwright-e2e.yml')
  const cypress = await read('../.github/workflows/cypress-deep-e2e.yml')
  assert.match(playwright, /on:\n\s+workflow_dispatch:/)
  assert.equal(playwright.includes('\n  push:'), false)
  assert.match(cypress, /on:\n\s+workflow_dispatch:/)
  assert.equal(cypress.includes('\n  workflow_run:'), false)
})


test('Playwright validates a cached browser session at most once per worker', async () => {
  const source = await read('../tests/e2e/helpers.mjs')
  assert.match(source, /let cachedBrowserSessionValidated = false/)
  assert.match(source, /if \(!cachedBrowserSessionValidated\)/)
  assert.match(source, /cachedBrowserSessionValidated = true/)
})

test('Cypress cached session does not boot the app solely for validation', async () => {
  const source = await read('../cypress/e2e/deep-oneengine.cy.mjs')
  const start = source.indexOf('cy.session(["oneengine-e2e", username]')
  const end = source.indexOf('function assertNoHorizontalOverflow', start)
  const sessionBlock = source.slice(start, end)
  assert.equal(sessionBlock.includes('validate()'), false)
  assert.match(sessionBlock, /cacheAcrossSpecs: true/)
})

test('manual Playwright workflow does not perform a duplicate pre-suite login', async () => {
  const source = await read('../.github/workflows/playwright-e2e.yml')
  assert.equal(source.includes('PAYLOAD="$(jq -n'), false)
  assert.equal(source.includes('/api/auth/login'), false)
  assert.match(source, /\/api\/health/)
})


test('page components never perform their own session bootstrap or store-context discovery', async () => {
  const { readdir } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const root = fileURLToPath(new URL('../src/pages/', import.meta.url))
  async function collect(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) files.push(...await collect(full))
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full)
    }
    return files
  }
  for (const file of await collect(root)) {
    const source = await readFile(file, 'utf8')
    assert.equal(source.includes('/api/auth/bootstrap'), false, file)
    assert.equal(source.includes('/api/auth/me/stores'), false, file)
    assert.equal(source.includes('ensureActingCompanyContext('), false, file)
  }
})

test('Developer does not write acting-company context for the authenticated tenant on initial load', async () => {
  const source = await read('../src/pages/developer/OneDeveloperPage.jsx')
  assert.match(source, /isOwnAuthenticatedCompany/)
  assert.match(source, /if \(!isOwnAuthenticatedCompany && preferredId !== String\(current \|\| ''\)\)/)
})

test('OneEngine Manager resolves permission and client discovery concurrently', async () => {
  const source = await read('../src/pages/developer/OneEngineManager.jsx')
  assert.match(source, /const \[permissions,r\]=await Promise\.all/)
  assert.match(source, /getStoredSessionPermissions\(\)/)
})


test('normal password login runs security, Google readiness and permissions concurrently', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  assert.match(server, /const \[securityContext, googleRuntime, permissionBundle\] = await Promise\.all/)
  assert.match(server, /getGoogleConnectPasswordLoginRuntime\(loginDb/)
  assert.equal(security.includes('row_to_json(gp.*) AS google_package'), false)
  assert.equal(security.includes('row_to_json(gc.*) AS google_connection'), false)
})


test('all production-facing live E2E workflows are manual-only', async () => {
  for (const path of [
    '../.github/workflows/playwright-e2e.yml',
    '../.github/workflows/cypress-deep-e2e.yml',
    '../.github/workflows/workflow-builder-e2e.yml',
    '../.github/workflows/appointment-debug.yml',
  ]) {
    const source = await read(path)
    assert.match(source, /on:\n\s+workflow_dispatch:/)
    assert.equal(source.includes('\n  push:'), false, path)
    assert.equal(source.includes('\n  workflow_run:'), false, path)
  }
})


test('core package function registry has no top-level-await discovery loop', async () => {
  const source = await read('../server/services/platformFunctionRegistry.js')
  assert.match(source, /packages\/functionsIndex\.js/)
  assert.equal(source.includes('for (const directory of await readdir'), false)
})

test('Render shutdown is bounded against stale keep-alive connections', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /closeIdleConnections/)
  assert.match(source, /closeAllConnections/)
  assert.match(source, /setTimeout\(\(\) => process\.exit\(0\), 5_000\)/)
})


test('trusted runtime accepts package functions protected by permissionsAny', async () => {
  const source = await read('../server/services/trustedRuntime.js')
  assert.match(source, /alternativePermissions/)
  assert.match(source, /fn\?\.permissionsAny/)
  assert.match(source, /!requiredPermissions\.length && !alternativePermissions\.length/)
})


test('login network policy uses the preloaded preflight result instead of another database round trip', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  assert.match(security, /trusted_network/)
  assert.match(security, /login_allowed_matches/)
  assert.match(server, /trustedNetworkOverride: securityContext\.trustedNetwork/)
  assert.match(server, /matches: securityContext\.loginAllowedMatches/)
})


test('login timing keeps permission and authorization phases separate', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /loginTimings\.permissions_ms = permissionDurationMs/)
  assert.match(source, /loginTimings\.authorization_bundle_ms = Date\.now\(\) - authorizationStartedAt/)
  assert.equal(source.includes('loginTimings.permissions_ms = loginTimings.authorization_bundle_ms'), false)
})


test('final loading verification waits for backend readiness before live login', async () => {
  const source = await read('../.github/workflows/final-loading-verification.yml')
  assert.match(source, /Wait for exact backend deployment readiness/)
  assert.match(source, /\/api\/health/)
  assert.match(source, /STATUS.*ready.*online/s)
  assert.match(source, /diagnostics\.buildCommit/)
  assert.match(source, /COMMIT.*GITHUB_SHA/s)
})


test('workspace app routes use cached metadata instead of forcing a blocking refresh', async () => {
  const source = await read('../src/pages/workspace/WorkspacePage.jsx')
  const start = source.indexOf("cachedGet('/api/platform/objects'")
  const end = source.indexOf('.then((objectResponse)', start)
  const block = source.slice(start, end)
  assert.match(block, /forceRefresh:\s*false/)
  assert.equal(block.includes('forceRefresh: true'), false)
})

test('Till starts till-session lookup alongside its bootstrap requests', async () => {
  const source = await read('../src/pages/till/TillPage.jsx')
  const start = source.indexOf('const tillPromise = loadTill()')
  const end = source.indexOf('await tillPromise', start)
  const block = source.slice(start, end)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(block, /Promise\.all\(\[/)
})

test('Settings loads values only for the active metadata section', async () => {
  const source = await read('../src/pages/settings/MetadataSettingsPage.jsx')
  assert.equal(source.includes('const sectionedPairs = await Promise.all(sectioned.map'), false)
  assert.match(source, /current\.type !== 'system'/)
  assert.match(source, /rowsLoaded === true/)
  assert.match(source, /void loadSectionedRows\(current\.object\)/)
})


test('login security preflight avoids nested lateral planner spikes', async () => {
  const source = await read('../server/services/identitySecurity.js')
  const start = source.indexOf('export async function loadLoginSecurityContext')
  const end = source.indexOf('export async function registerFailedLogin', start)
  const block = source.slice(start, end)
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.equal(block.includes('LEFT JOIN LATERAL'), false)
  assert.match(block, /const \[baseResult, policy\] = await Promise\.all/)
  assert.match(block, /identity_security_ip_ranges/)
})

test('login access policy precedence uses indexed exact-scope branches', async () => {
  const source = await read('../server/services/identitySecurity.js')
  const start = source.indexOf('export async function resolveAccessPolicy')
  const end = source.indexOf('function zonedParts', start)
  const block = source.slice(start, end)
  assert.match(block, /UNION ALL/)
  assert.match(block, /scope_type='USER'/)
  assert.match(block, /scope_type='ROLE'/)
  assert.match(block, /scope_type='COMPANY'/)
  assert.equal(block.includes("OR (scope_type='ROLE'"), false)
})


test('final live login verification proves five consecutive samples without exceeding the limiter', async () => {
  const source = await read('../tests/e2e/final-loading-verification.spec.mjs')
  assert.match(source, /for \(let attempt = 1; attempt <= 4; attempt \+= 1\)/)
  assert.match(source, /loginTotals\.push\(loginServerTotal\)/)
  assert.match(source, /toHaveLength\(5\)/)
  assert.match(source, /ms > 1500/)
})

test('final live loading verification only runs for explicit perf verification commits', async () => {
  const source = await read('../.github/workflows/final-loading-verification.yml')
  assert.match(source, /if: contains\(github\.event\.head_commit\.message, '\[perf-verify\]'\)/)
})
