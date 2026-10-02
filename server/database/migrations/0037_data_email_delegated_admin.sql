-- Phase 4: data protection, email security and delegated administration.

CREATE TABLE IF NOT EXISTS data_export_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  frequency TEXT NOT NULL DEFAULT 'MANUAL' CHECK (frequency IN ('MANUAL','WEEKLY','MONTHLY')),
  include_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  include_audit_logs BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_export_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','FAILED','EXPIRED')),
  row_count INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT 'application/gzip',
  payload BYTEA,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW()+INTERVAL '48 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_data_export_runs_company ON data_export_runs(company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  age_days INTEGER NOT NULL CHECK(age_days BETWEEN 1 AND 36500),
  action TEXT NOT NULL CHECK(action IN ('DELETE','ANONYMIZE')),
  date_field TEXT NOT NULL DEFAULT 'created_at',
  anonymize_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,name)
);

CREATE TABLE IF NOT EXISTS email_deliverability_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'ALL_EMAIL' CHECK(access_level IN ('NO_EMAIL','SYSTEM_ONLY','ALL_EMAIL')),
  require_verified_sender BOOLEAN NOT NULL DEFAULT TRUE,
  use_substitute_for_unverified BOOLEAN NOT NULL DEFAULT FALSE,
  no_reply_address_id UUID,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_sending_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','FAILED')),
  dkim_selector TEXT,
  dkim_public_key TEXT,
  dns_verification_token TEXT,
  verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,domain)
);

CREATE TABLE IF NOT EXISTS organization_email_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  purpose TEXT NOT NULL DEFAULT 'GENERAL' CHECK(purpose IN ('GENERAL','NO_REPLY','SUPPORT','BILLING','MARKETING')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  allow_all_users BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,email)
);

CREATE TABLE IF NOT EXISTS organization_email_role_access (
  email_address_id UUID NOT NULL REFERENCES organization_email_addresses(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY(email_address_id,role_id)
);

ALTER TABLE email_deliverability_settings
  DROP CONSTRAINT IF EXISTS email_deliverability_settings_no_reply_address_id_fkey;
ALTER TABLE email_deliverability_settings
  ADD CONSTRAINT email_deliverability_settings_no_reply_address_id_fkey
  FOREIGN KEY(no_reply_address_id) REFERENCES organization_email_addresses(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS delegated_admin_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  allow_login_access BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,name)
);
CREATE TABLE IF NOT EXISTS delegated_admin_members (
  group_id UUID NOT NULL REFERENCES delegated_admin_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,user_id)
);
CREATE TABLE IF NOT EXISTS delegated_admin_role_scopes (
  group_id UUID NOT NULL REFERENCES delegated_admin_groups(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,role_id)
);
CREATE TABLE IF NOT EXISTS delegated_admin_assignable_roles (
  group_id UUID NOT NULL REFERENCES delegated_admin_groups(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY(group_id,role_id)
);

INSERT INTO permissions(code,name,description) VALUES
 ('data.export.manage','Manage Data Export','Configure and generate tenant data exports'),
 ('data.retention.manage','Manage Data Retention','Configure tenant retention and anonymisation policies'),
 ('email.security.manage','Manage Email Security','Manage deliverability, verified senders and email domains'),
 ('delegated_admin.manage','Manage Delegated Administration','Configure scoped delegated administrators')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;
