import test from 'node:test'
import assert from 'node:assert/strict'
import { emailAddressAllowedForRole, resolveSystemEmailSender } from '../server/services/emailSecurity.js'

test('system email is blocked when deliverability is disabled',async()=>{
  const db=async(sql)=>{
    if(sql.includes('email_deliverability_settings'))return {rows:[{access_level:'NO_EMAIL',require_verified_sender:true}]}
    throw new Error('unexpected query')
  }
  const r=await resolveSystemEmailSender(db,{companyId:'c',requestedFrom:'billing@example.com'})
  assert.equal(r.allowed,false)
  assert.equal(r.reason,'EMAIL_DELIVERY_DISABLED')
})

test('verified organization-wide sender is accepted',async()=>{
  const db=async(sql)=>{
    if(sql.includes('email_deliverability_settings'))return {rows:[{access_level:'ALL_EMAIL',require_verified_sender:true}]}
    if(sql.includes('organization_email_addresses'))return {rows:[{id:'a1',email:'billing@example.com',verified:true,active:true}]}
    throw new Error('unexpected query '+sql)
  }
  const r=await resolveSystemEmailSender(db,{companyId:'c',requestedFrom:'billing@example.com'})
  assert.equal(r.allowed,true)
  assert.equal(r.email,'billing@example.com')
})

test('restricted organization sender requires role assignment',async()=>{
  const db=async(sql)=>{
    if(sql.includes('FROM organization_email_addresses'))return {rows:[{id:'a1',allow_all_users:false}]}
    if(sql.includes('organization_email_role_access'))return {rows:[]}
    throw new Error('unexpected query '+sql)
  }
  assert.equal(await emailAddressAllowedForRole(db,{companyId:'c',roleId:'r1',addressId:'a1'}),false)
})
