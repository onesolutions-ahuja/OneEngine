ALTER TABLE identity_mfa_methods
  ADD COLUMN IF NOT EXISTS authenticator_kind TEXT;

ALTER TABLE identity_mfa_methods
  DROP CONSTRAINT IF EXISTS identity_mfa_methods_authenticator_kind_check;
ALTER TABLE identity_mfa_methods
  ADD CONSTRAINT identity_mfa_methods_authenticator_kind_check
  CHECK (authenticator_kind IS NULL OR authenticator_kind IN ('PLATFORM','SECURITY_KEY'));
