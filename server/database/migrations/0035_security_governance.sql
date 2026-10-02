-- Phase 3: security governance, connected-app controls, trusted origins and credential/certificate inventory.

CREATE TABLE IF NOT EXISTS security_api_policies (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enforce_connected_app_policy BOOLEAN NOT NULL DEFAULT FALSE,
  require_pkce BOOLEAN NOT NULL DEFAULT TRUE,
  require_high_assurance_for_app_admin BOOLEAN NOT NULL DEFAULT FALSE,
  default_refresh_token_days INTEGER NOT NULL DEFAULT 30 CHECK (default_refresh_token_days BETWEEN 1 AND 3650),
  max_refresh_token_days INTEGER NOT NULL DEFAULT 180 CHECK (max_refresh_token_days BETWEEN 1 AND 3650),
  allowed_grant_types JSONB NOT NULL DEFAULT '["authorization_code","refresh_token"]'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_trusted_origins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  origin TEXT NOT NULL,
  origin_type TEXT NOT NULL DEFAULT 'CORS' CHECK (origin_type IN ('CORS','CSP_CONNECT','REDIRECT_URI','WEBHOOK')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,origin,origin_type)
);
CREATE INDEX IF NOT EXISTS ix_security_trusted_origins_company
  ON security_trusted_origins(company_id,origin_type,active);

CREATE TABLE IF NOT EXISTS security_connected_app_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  app_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  integration_connection_id UUID REFERENCES integration_connections(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  permitted_user_mode TEXT NOT NULL DEFAULT 'ALL_AUTHORISED' CHECK (permitted_user_mode IN ('ALL_AUTHORISED','ADMIN_APPROVED')),
  allowed_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  refresh_token_days INTEGER,
  ip_policy TEXT NOT NULL DEFAULT 'ENFORCE' CHECK (ip_policy IN ('ENFORCE','RELAX')),
  require_high_assurance BOOLEAN NOT NULL DEFAULT FALSE,
  revoke_on_policy_change BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,app_key)
);
CREATE INDEX IF NOT EXISTS ix_security_connected_app_company
  ON security_connected_app_policies(company_id,active);

CREATE TABLE IF NOT EXISTS security_vault_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT,
  secret_ciphertext TEXT NOT NULL,
  secret_kind TEXT NOT NULL DEFAULT 'GENERIC',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,name)
);

CREATE TABLE IF NOT EXISTS security_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  purpose TEXT,
  certificate_pem TEXT NOT NULL,
  private_key_ciphertext TEXT,
  fingerprint_sha256 TEXT NOT NULL,
  not_before TIMESTAMPTZ,
  not_after TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,name)
);
CREATE INDEX IF NOT EXISTS ix_security_certificates_expiry
  ON security_certificates(company_id,active,not_after);

CREATE TABLE IF NOT EXISTS security_health_waivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  finding_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,finding_key)
);

INSERT INTO permissions(code,name,description) VALUES
 ('security.governance.manage','Manage Security Governance','Manage API/OAuth policies, connected apps, trusted origins, certificates and credential vault metadata'),
 ('security.health.view','View Security Health Check','View security posture findings and remediation guidance'),
 ('security.vault.manage','Manage Credential Vault','Create, rotate and deactivate encrypted credential vault entries')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;
