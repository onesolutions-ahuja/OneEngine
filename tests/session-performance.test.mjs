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

test('RBAC role and permission-set reads run in parallel', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /const \[codes, permissionSets\] = await Promise\.all/)
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

test('Google Connect login readiness uses one parallel read bundle', async () => {
  const source = await read('../server/services/googleConnect.js')
  assert.match(source, /const \[packageResult, entitlements, connectionResult\] = await Promise\.all/)
})


test('password verification runs alongside login preflight and records its own duration', async () => {
  const source = await read('../server/server.js')
  assert.match(source, /const passwordCheckPromise = \(async \(\) =>/)
  assert.match(source, /const \[securityContext, googleRuntime\] = await Promise\.all/)
  assert.match(source, /const validPassword = await passwordCheckPromise/)
  assert.match(source, /loginTimings\.bcrypt_ms = bcryptDurationMs/)
})


test('login security preflight is bundled into one database read', async () => {
  const server = await read('../server/server.js')
  const security = await read('../server/services/identitySecurity.js')
  assert.match(server, /loadLoginSecurityContext\(loginDb/)
  assert.match(server, /security_preflight_ms/)
  assert.match(security, /export async function loadLoginSecurityContext/)
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
  assert.match(server, /getGoogleConnectPasswordLoginRuntime/)
  assert.match(google, /export async function getGoogleConnectPasswordLoginRuntime/)
  assert.match(google, /if \(!packageRow \|\| !installed \|\| !enabled \|\| !configured\)/)
  const fastPath = google.slice(
    google.indexOf('export async function getGoogleConnectPasswordLoginRuntime'),
    google.indexOf('export async function getGoogleConnectRuntimeForEmail')
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
