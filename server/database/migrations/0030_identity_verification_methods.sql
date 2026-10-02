-- Phase 2 parity: verification method policy and temporary MFA codes.
ALTER TABLE identity_security_settings
  ALTER COLUMN totp_assurance SET DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS allow_totp BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_platform_passkeys BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_security_keys BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_recovery_codes BOOLEAN NOT NULL DEFAULT TRUE;

-- This phase initially seeded TOTP as HIGH. Salesforce treats third-party TOTP
-- as standard-strength; correct untouched/default rows while preserving tenants
-- that explicitly use other values.
UPDATE identity_security_settings
SET totp_assurance='STANDARD'
WHERE totp_assurance='HIGH' AND updated_by IS NULL;

CREATE TABLE IF NOT EXISTS identity_temporary_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expired_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_identity_temp_codes_user_time
  ON identity_temporary_verification_codes(user_id, generated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_temp_code_active_user
  ON identity_temporary_verification_codes(user_id)
  WHERE expired_at IS NULL;
