import test from 'node:test'
import assert from 'node:assert/strict'
import { assuranceSatisfies, effectiveAssurance } from '../server/services/identityAssurance.js'

test('assurance hierarchy inherits tenant defaults when policy overrides are null',()=>{
  const settings={
    mfa_required:true,phishing_resistant_mfa_required:false,required_login_assurance:'HIGH',
    trusted_device_days:30,trust_sso_mfa:true,password_assurance:'STANDARD',
    totp_assurance:'HIGH',passkey_assurance:'HIGH',sso_assurance:'STANDARD',
    step_up_period_minutes:15,device_activation_required:true,skip_device_activation_on_trusted_network:true,
  }
  const policy={mfa_required:null,required_login_assurance:null,trusted_device_days:null,device_activation_required:null}
  const result=effectiveAssurance(settings,policy)
  assert.equal(result.mfaRequired,true)
  assert.equal(result.requiredLoginAssurance,'HIGH')
  assert.equal(result.trustedDeviceDays,30)
  assert.equal(result.deviceActivationRequired,true)
})

test('role or user policy can override individual assurance fields without copying the whole tenant policy',()=>{
  const settings={
    mfa_required:false,phishing_resistant_mfa_required:false,required_login_assurance:'STANDARD',
    trusted_device_days:30,trust_sso_mfa:true,password_assurance:'STANDARD',
    totp_assurance:'HIGH',passkey_assurance:'HIGH',sso_assurance:'STANDARD',
    step_up_period_minutes:15,device_activation_required:false,skip_device_activation_on_trusted_network:true,
  }
  const policy={mfa_required:true,phishing_resistant_mfa_required:true,required_login_assurance:'HIGH',trusted_device_days:7,trust_sso_mfa:false,device_activation_required:true,skip_device_activation_on_trusted_network:false}
  const result=effectiveAssurance(settings,policy)
  assert.equal(result.mfaRequired,true)
  assert.equal(result.phishingResistantRequired,true)
  assert.equal(result.requiredLoginAssurance,'HIGH')
  assert.equal(result.trustedDeviceDays,7)
  assert.equal(result.trustSsoMfa,false)
  assert.equal(result.deviceActivationRequired,true)
  assert.equal(result.skipDeviceActivationOnTrustedNetwork,false)
})

test('high assurance satisfies standard and high while standard cannot satisfy high',()=>{
  assert.equal(assuranceSatisfies('HIGH','STANDARD'),true)
  assert.equal(assuranceSatisfies('HIGH','HIGH'),true)
  assert.equal(assuranceSatisfies('STANDARD','STANDARD'),true)
  assert.equal(assuranceSatisfies('STANDARD','HIGH'),false)
})
