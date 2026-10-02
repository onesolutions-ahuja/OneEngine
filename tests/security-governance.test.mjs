import test from 'node:test'
import assert from 'node:assert/strict'
import { connectedAppDecision, normalizeScopes, normalizeTrustedOrigin } from '../server/services/securityGovernance.js'

test('trusted origins require exact HTTPS origins',()=>{
  assert.equal(normalizeTrustedOrigin('https://app.example.com/'),'https://app.example.com')
  assert.equal(normalizeTrustedOrigin('https://app.example.com/path'),null)
  assert.equal(normalizeTrustedOrigin('http://app.example.com'),null)
  assert.equal(normalizeTrustedOrigin('http://localhost:5173',{allowLocalhost:true}),'http://localhost:5173')
})

test('scope normalization is stable and de-duplicated',()=>{
  assert.deepEqual(normalizeScopes('write_products read_orders,write_products'),['read_orders','write_products'])
})

test('connected app governance is observe-only until enforcement is enabled',async()=>{
  const db=async(sql)=>{
    if(sql.includes('security_api_policies'))return {rows:[{enforce_connected_app_policy:false}]}
    throw new Error('unexpected query')
  }
  const decision=await connectedAppDecision(db,{companyId:'c',appKey:'shopify',userId:'u',requestedScopes:['read_orders']})
  assert.equal(decision.allowed,true)
  assert.equal(decision.reason,'POLICY_NOT_ENFORCED')
})

test('admin-approved connected app requires an explicit user assignment',async()=>{
  const db=async(sql)=>{
    if(sql.includes('security_api_policies'))return {rows:[{enforce_connected_app_policy:true,allowed_grant_types:['authorization_code']}]}
    if(sql.includes('security_connected_app_policies'))return {rows:[{id:'p1',permitted_user_mode:'ADMIN_APPROVED',allowed_scopes:['read_orders']}]}
    if(sql.includes('security_connected_app_user_assignments'))return {rows:[]}
    throw new Error('unexpected query '+sql)
  }
  const decision=await connectedAppDecision(db,{companyId:'c',appKey:'shopify',userId:'u',requestedScopes:['read_orders']})
  assert.equal(decision.allowed,false)
  assert.equal(decision.reason,'CONNECTED_APP_USER_NOT_APPROVED')
})

test('connected app blocks scopes outside the approved set',async()=>{
  const db=async(sql)=>{
    if(sql.includes('security_api_policies'))return {rows:[{enforce_connected_app_policy:true,allowed_grant_types:['authorization_code']}]}
    if(sql.includes('security_connected_app_policies'))return {rows:[{id:'p1',permitted_user_mode:'ALL_AUTHORISED',allowed_scopes:['read_orders']}]}
    throw new Error('unexpected query '+sql)
  }
  const decision=await connectedAppDecision(db,{companyId:'c',appKey:'shopify',userId:'u',requestedScopes:['read_orders','write_products']})
  assert.equal(decision.allowed,false)
  assert.equal(decision.reason,'OAUTH_SCOPE_NOT_APPROVED')
  assert.deepEqual(decision.missingScopes,['write_products'])
})
