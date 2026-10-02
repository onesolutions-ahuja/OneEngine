-- Phase 2 layered assurance overrides. NULL means inherit from tenant defaults.
ALTER TABLE identity_access_policies
  ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS phishing_resistant_mfa_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS required_login_assurance TEXT,
  ADD COLUMN IF NOT EXISTS trusted_device_days INTEGER,
  ADD COLUMN IF NOT EXISTS trust_sso_mfa BOOLEAN;

ALTER TABLE identity_access_policies
  DROP CONSTRAINT IF EXISTS identity_access_policies_required_login_assurance_check;
ALTER TABLE identity_access_policies
  ADD CONSTRAINT identity_access_policies_required_login_assurance_check
  CHECK (required_login_assurance IS NULL OR required_login_assurance IN ('STANDARD','HIGH'));
ALTER TABLE identity_access_policies
  DROP CONSTRAINT IF EXISTS identity_access_policies_trusted_device_days_check;
ALTER TABLE identity_access_policies
  ADD CONSTRAINT identity_access_policies_trusted_device_days_check
  CHECK (trusted_device_days IS NULL OR trusted_device_days BETWEEN 0 AND 3650);
