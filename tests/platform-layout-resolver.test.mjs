import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveAssignedPageLayout } from '../server/services/platformLayoutResolver.js'

const layout = (id, extra = {}) => ({
  id,
  active: true,
  company_id: null,
  is_default: false,
  updated_at: '2026-01-01T00:00:00Z',
  ...extra,
})

const assignment = (layoutId, extra = {}) => ({
  layout_id: layoutId,
  active: true,
  app_id: null,
  record_type_id: null,
  role_id: null,
  device_profile: 'any',
  required_permissions: [],
  priority: 0,
  ...extra,
})

test('most specific matching activation wins', () => {
  const rows = [
    layout('fallback', { is_default: true }),
    layout('targeted'),
  ]
  const assignments = [
    assignment('targeted', {
      app_id: 'app-1',
      record_type_id: 'rt-1',
      role_id: 'role-1',
      device_profile: 'mobile',
    }),
  ]

  const result = resolveAssignedPageLayout(rows, assignments, {
    companyId: 'company-1',
    appId: 'app-1',
    recordTypeId: 'rt-1',
    roleId: 'role-1',
    deviceProfile: 'mobile',
  })

  assert.equal(result?.id, 'targeted')
  assert.equal(result?.effective_assignment?.app_id, 'app-1')
})

test('explicit assignment prevents a layout from widening through legacy columns', () => {
  const rows = [
    layout('fallback', { is_default: true }),
    layout('assigned-only', { role_id: 'role-1' }),
  ]
  const assignments = [
    assignment('assigned-only', { app_id: 'special-app' }),
  ]

  const result = resolveAssignedPageLayout(rows, assignments, {
    companyId: 'company-1',
    appId: 'different-app',
    roleId: 'role-1',
    deviceProfile: 'desktop',
  })

  assert.equal(result?.id, 'fallback')
})

test('priority deliberately overrides normal specificity', () => {
  const rows = [layout('generic'), layout('specific')]
  const assignments = [
    assignment('generic', { priority: 5 }),
    assignment('specific', {
      app_id: 'app-1',
      record_type_id: 'rt-1',
      role_id: 'role-1',
      device_profile: 'tablet',
      priority: 0,
    }),
  ]

  const result = resolveAssignedPageLayout(rows, assignments, {
    companyId: 'company-1',
    appId: 'app-1',
    recordTypeId: 'rt-1',
    roleId: 'role-1',
    deviceProfile: 'tablet',
  })

  assert.equal(result?.id, 'generic')
})

test('tenant layout wins a same-scope tie over a global layout', () => {
  const rows = [
    layout('global'),
    layout('tenant', { company_id: 'company-1' }),
  ]
  const assignments = [
    assignment('global'),
    assignment('tenant'),
  ]

  const result = resolveAssignedPageLayout(rows, assignments, {
    companyId: 'company-1',
    deviceProfile: 'desktop',
  })

  assert.equal(result?.id, 'tenant')
})

test('device-specific assignment only matches that form factor', () => {
  const rows = [
    layout('desktop', { is_default: true }),
    layout('mobile'),
  ]
  const assignments = [
    assignment('mobile', { device_profile: 'mobile' }),
  ]

  assert.equal(
    resolveAssignedPageLayout(rows, assignments, {
      companyId: 'company-1',
      deviceProfile: 'mobile',
    })?.id,
    'mobile',
  )

  assert.equal(
    resolveAssignedPageLayout(rows, assignments, {
      companyId: 'company-1',
      deviceProfile: 'desktop',
    })?.id,
    'desktop',
  )
})
