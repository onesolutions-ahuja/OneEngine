-- Phase 3 follow-up: explicit approved-user assignments for connected apps.
CREATE TABLE IF NOT EXISTS security_connected_app_user_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connected_app_policy_id UUID NOT NULL REFERENCES security_connected_app_policies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id,connected_app_policy_id,user_id)
);
CREATE INDEX IF NOT EXISTS ix_security_connected_app_users
  ON security_connected_app_user_assignments(company_id,connected_app_policy_id,active);
