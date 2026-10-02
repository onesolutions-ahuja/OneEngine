-- Phase 2: identity assurance, MFA, trusted devices, authentication providers.
ALTER TABLE identity_security_settings
  ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS phishing_resistant_mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS trust_sso_mfa BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS trusted_device_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS step_up_period_minutes INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS required_login_assurance TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS password_assurance TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS totp_assurance TEXT NOT NULL DEFAULT 'HIGH',
  ADD COLUMN IF NOT EXISTS passkey_assurance TEXT NOT NULL DEFAULT 'HIGH',
  ADD COLUMN IF NOT EXISTS sso_assurance TEXT NOT NULL DEFAULT 'STANDARD';

ALTER TABLE identity_security_settings
  DROP CONSTRAINT IF EXISTS identity_security_settings_required_login_assurance_check;
ALTER TABLE identity_security_settings
  ADD CONSTRAINT identity_security_settings_required_login_assurance_check
  CHECK (required_login_assurance IN ('STANDARD','HIGH'));
ALTER TABLE identity_security_settings
  DROP CONSTRAINT IF EXISTS identity_security_settings_trusted_device_days_check;
ALTER TABLE identity_security_settings
  ADD CONSTRAINT identity_security_settings_trusted_device_days_check
  CHECK (trusted_device_days BETWEEN 0 AND 3650);
ALTER TABLE identity_security_settings
  DROP CONSTRAINT IF EXISTS identity_security_settings_step_up_period_check;
ALTER TABLE identity_security_settings
  ADD CONSTRAINT identity_security_settings_step_up_period_check
  CHECK (step_up_period_minutes BETWEEN 1 AND 1440);

CREATE TABLE IF NOT EXISTS identity_mfa_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method_type TEXT NOT NULL CHECK (method_type IN ('TOTP','PASSKEY','RECOVERY_CODES')),
  label TEXT,
  secret_ciphertext TEXT,
  credential_id TEXT,
  public_key TEXT,
  sign_count BIGINT NOT NULL DEFAULT 0,
  transports JSONB NOT NULL DEFAULT '[]'::jsonb,
  aaguid TEXT,
  discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  phishing_resistant BOOLEAN NOT NULL DEFAULT FALSE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id,method_type,label)
);
CREATE INDEX IF NOT EXISTS ix_identity_mfa_methods_user ON identity_mfa_methods(user_id,active);

CREATE TABLE IF NOT EXISTS identity_mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('LOGIN','STEP_UP','PASSKEY_REGISTRATION','PASSKEY_AUTHENTICATION')),
  challenge TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_identity_mfa_challenges_user ON identity_mfa_challenges(user_id,expires_at);

CREATE TABLE IF NOT EXISTS identity_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_token_hash TEXT NOT NULL UNIQUE,
  device_name TEXT,
  platform TEXT,
  browser TEXT,
  first_ip INET,
  last_ip INET,
  trusted_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_identity_trusted_devices_user ON identity_trusted_devices(user_id,revoked_at,trusted_until);

CREATE TABLE IF NOT EXISTS identity_auth_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('GOOGLE','APPLE','OIDC','SAML')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  show_on_login BOOLEAN NOT NULL DEFAULT TRUE,
  use_oneengine_mfa BOOLEAN NOT NULL DEFAULT FALSE,
  assurance_level TEXT NOT NULL DEFAULT 'STANDARD' CHECK (assurance_level IN ('STANDARD','HIGH')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_encrypted TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,provider_key)
);

CREATE TABLE IF NOT EXISTS identity_step_up_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resource_key TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'RAISE' CHECK (action IN ('ALLOW','RAISE','BLOCK')),
  required_assurance TEXT NOT NULL DEFAULT 'HIGH' CHECK (required_assurance IN ('STANDARD','HIGH')),
  reverify_after_minutes INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,resource_key)
);

ALTER TABLE identity_sessions
  ADD COLUMN IF NOT EXISTS assurance_level TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS assurance_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mfa_method TEXT,
  ADD COLUMN IF NOT EXISTS trusted_device_id UUID REFERENCES identity_trusted_devices(id) ON DELETE SET NULL;
