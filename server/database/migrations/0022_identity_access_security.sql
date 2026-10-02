-- Phase 1: Salesforce-style access perimeter and session security.
CREATE TABLE IF NOT EXISTS identity_security_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  password_expiry_days INTEGER NOT NULL DEFAULT 90 CHECK (password_expiry_days BETWEEN 0 AND 3650),
  password_history_count INTEGER NOT NULL DEFAULT 5 CHECK (password_history_count BETWEEN 0 AND 24),
  minimum_password_length INTEGER NOT NULL DEFAULT 12 CHECK (minimum_password_length BETWEEN 8 AND 128),
  password_complexity TEXT NOT NULL DEFAULT 'THREE_OF_FOUR' CHECK (password_complexity IN ('NONE','LETTER_NUMBER','THREE_OF_FOUR','ALL_FOUR')),
  maximum_invalid_login_attempts INTEGER NOT NULL DEFAULT 3 CHECK (maximum_invalid_login_attempts BETWEEN 0 AND 100),
  lockout_minutes INTEGER NOT NULL DEFAULT 15 CHECK (lockout_minutes BETWEEN 0 AND 10080),
  minimum_password_lifetime_hours INTEGER NOT NULL DEFAULT 24 CHECK (minimum_password_lifetime_hours BETWEEN 0 AND 720),
  session_inactivity_minutes INTEGER NOT NULL DEFAULT 120 CHECK (session_inactivity_minutes BETWEEN 0 AND 10080),
  maximum_session_hours INTEGER NOT NULL DEFAULT 12 CHECK (maximum_session_hours BETWEEN 1 AND 720),
  enforce_login_ip_every_request BOOLEAN NOT NULL DEFAULT FALSE,
  lock_session_to_ip BOOLEAN NOT NULL DEFAULT FALSE,
  terminate_sessions_on_password_reset BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_access_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  scope_type TEXT NOT NULL DEFAULT 'COMPANY' CHECK (scope_type IN ('COMPANY','ROLE','USER')),
  scope_id UUID,
  priority INTEGER NOT NULL DEFAULT 100,
  timezone TEXT,
  login_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  enforce_login_ip BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope_type='COMPANY' AND scope_id IS NULL) OR (scope_type<>'COMPANY' AND scope_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_access_policy_scope
  ON identity_access_policies(company_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE active=TRUE;

CREATE TABLE IF NOT EXISTS identity_security_ip_ranges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES identity_access_policies(id) ON DELETE CASCADE,
  range_type TEXT NOT NULL CHECK (range_type IN ('TRUSTED','LOGIN_ALLOWED')),
  label TEXT,
  start_ip INET NOT NULL,
  end_ip INET NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (family(start_ip)=family(end_ip)),
  CHECK ((range_type='TRUSTED' AND policy_id IS NULL) OR (range_type='LOGIN_ALLOWED' AND policy_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ix_identity_ip_ranges_company_type ON identity_security_ip_ranges(company_id, range_type, active);
CREATE INDEX IF NOT EXISTS ix_identity_ip_ranges_policy ON identity_security_ip_ranges(policy_id, active);

CREATE TABLE IF NOT EXISTS identity_user_security_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_failed_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  sessions_revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity_password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_identity_password_history_user ON identity_password_history(user_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS identity_sessions (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  auth_method TEXT NOT NULL DEFAULT 'PASSWORD',
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_identity_sessions_user_active ON identity_sessions(user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS ix_identity_sessions_company_active ON identity_sessions(company_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS identity_login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  login_identifier TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('SUCCESS','FAILURE','BLOCKED')),
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  auth_method TEXT NOT NULL DEFAULT 'PASSWORD',
  session_id UUID
);
CREATE INDEX IF NOT EXISTS ix_identity_login_history_company_time ON identity_login_history(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_identity_login_history_user_time ON identity_login_history(user_id, occurred_at DESC);

INSERT INTO identity_security_settings(company_id)
SELECT id FROM companies
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO identity_access_policies(company_id,name,description,scope_type,priority,timezone,login_hours,enforce_login_ip,active)
SELECT c.id,'Default Access Policy','Default company access policy','COMPANY',100,c.timezone,'{}'::jsonb,FALSE,TRUE
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM identity_access_policies p WHERE p.company_id=c.id AND p.scope_type='COMPANY' AND p.active=TRUE
);
