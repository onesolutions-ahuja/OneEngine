const DEFINITIONS = [
  { id: 'appointments.manage', prefixes: ['/api/appointments'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'platform.developer.manage', prefixes: ['/api/platform/developer/'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'platform.metadata.execute', prefixes: ['/api/platform/'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'package.lifecycle', prefixes: ['/api/packages/', '/api/platform/packages/'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'security.manage', prefixes: ['/api/platform/security'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'admin.manage', prefixes: ['/api/admin/'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'settings.manage', prefixes: ['/api/settings/'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'payment.execute', prefixes: ['/api/payments', '/api/payment', '/api/checkout', '/api/till/payment'], methods: ['POST','PUT','PATCH','DELETE'] },
  { id: 'refund.execute', prefixes: ['/api/refunds', '/api/returns', '/api/exchanges'], methods: ['POST','PUT','PATCH','DELETE'] },
]

function canonicalPath(value) {
  try { return new URL(String(value || ''), 'https://oneengine.invalid').pathname }
  catch { return String(value || '').split('?')[0] }
}

function normalise(definition) {
  return Object.freeze({
    id: String(definition.id),
    prefixes: Object.freeze([...definition.prefixes].map(String)),
    methods: Object.freeze([...definition.methods].map((method) => String(method).toUpperCase())),
  })
}

export const TRUSTED_CAPABILITIES = Object.freeze(DEFINITIONS.map(normalise))
export const TRUSTED_CAPABILITY_MAP = Object.freeze(
  Object.fromEntries(TRUSTED_CAPABILITIES.map((definition) => [definition.id, definition]))
)

const manifestText = TRUSTED_CAPABILITIES
  .map((definition) => `${definition.id}:${definition.methods.join(',')}:${definition.prefixes.join(',')}`)
  .sort()
  .join('|')

function stableHash(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const TRUSTED_RUNTIME_VERSION = stableHash(manifestText)

export function resolveTrustedCapability(path, method = 'GET') {
  const pathname = canonicalPath(path)
  const verb = String(method || 'GET').toUpperCase()
  return TRUSTED_CAPABILITIES.find(
    (definition) => definition.methods.includes(verb)
      && definition.prefixes.some((prefix) => {
        const collection = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
        return pathname === prefix || pathname === collection || pathname.startsWith(prefix)
      })
  ) || null
}

export function assertTrustedCapability(capabilityId, { path = '', method = 'GET' } = {}) {
  const definition = TRUSTED_CAPABILITY_MAP[String(capabilityId || '')]
  if (!definition) {
    const error = new Error('Unregistered capability is blocked by OneEngine Trusted Runtime')
    error.code = 'UNREGISTERED_CAPABILITY'
    error.status = 403
    throw error
  }
  const resolved = resolveTrustedCapability(path, method)
  if (!resolved || resolved.id !== definition.id) {
    const error = new Error('Capability does not match the requested operation')
    error.code = 'CAPABILITY_MISMATCH'
    error.status = 403
    throw error
  }
  return definition
}

export function validateTrustedRuntime() {
  const seen = new Set()
  for (const definition of TRUSTED_CAPABILITIES) {
    if (!definition.id || seen.has(definition.id)) throw new Error('Trusted Runtime capability manifest is invalid')
    seen.add(definition.id)
    if (!definition.methods.length || !definition.prefixes.length) throw new Error(`Trusted Runtime capability is incomplete: ${definition.id}`)
  }
  return Object.freeze({ version: TRUSTED_RUNTIME_VERSION, count: TRUSTED_CAPABILITIES.length })
}

export function isPrivilegedMutation(path, method = 'GET') {
  const verb = String(method || 'GET').toUpperCase()
  if (!['POST','PUT','PATCH','DELETE'].includes(verb)) return false
  const pathname = canonicalPath(path)
  return pathname.startsWith('/api/appointments')
    || pathname.startsWith('/api/platform/')
    || pathname.startsWith('/api/packages/')
    || pathname.startsWith('/api/admin/')
    || pathname.startsWith('/api/settings/')
    || pathname.startsWith('/api/payments')
    || pathname.startsWith('/api/payment')
    || pathname.startsWith('/api/refunds')
    || pathname.startsWith('/api/returns')
    || pathname.startsWith('/api/exchanges')
}
