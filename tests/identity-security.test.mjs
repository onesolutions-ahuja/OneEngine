import test from 'node:test'
import assert from 'node:assert/strict'
import { loginHoursAllowed, passwordPolicyError, validateLoginHours } from '../server/services/identitySecurity.js'

test('login hours allow unrestricted policy',()=>{
  assert.equal(loginHoursAllowed({login_hours:{}},new Date('2026-10-02T12:00:00Z'),'UTC'),true)
})

test('login hours support same start/end as blocked day',()=>{
  const policy={timezone:'UTC',login_hours:{friday:{enabled:true,start:'00:00',end:'00:00'}}}
  assert.equal(loginHoursAllowed(policy,new Date('2026-10-02T12:00:00Z'),'UTC'),false)
})

test('login hours support overnight windows',()=>{
  const policy={timezone:'UTC',login_hours:{friday:{enabled:true,start:'22:00',end:'06:00'}}}
  assert.equal(loginHoursAllowed(policy,new Date('2026-10-02T23:00:00Z'),'UTC'),true)
  assert.equal(loginHoursAllowed(policy,new Date('2026-10-02T12:00:00Z'),'UTC'),false)
})

test('login hours validation rejects malformed time',()=>{
  assert.throws(()=>validateLoginHours({monday:{enabled:true,start:'9:00',end:'17:00'}}),/HH:MM/)
})

test('Salesforce-style password complexity modes are enforced',()=>{
  const base={minimum_password_length:8}
  assert.equal(passwordPolicyError('abcdefgh',{...base,password_complexity:'NONE'}),null)
  assert.match(passwordPolicyError('abcdefgh',{...base,password_complexity:'ALPHA_NUMERIC'}),/alphabetic and numeric/)
  assert.equal(passwordPolicyError('abc12345',{...base,password_complexity:'ALPHA_NUMERIC'}),null)
  assert.equal(passwordPolicyError('abc123!x',{...base,password_complexity:'ALPHA_NUMERIC_SPECIAL'}),null)
  assert.equal(passwordPolicyError('Abc12345',{...base,password_complexity:'NUM_UPPER_LOWER'}),null)
  assert.equal(passwordPolicyError('Abc123!x',{...base,password_complexity:'NUM_UPPER_LOWER_SPECIAL'}),null)
  assert.equal(passwordPolicyError('Abc12345',{...base,password_complexity:'THREE_OF_FOUR'}),null)
})
