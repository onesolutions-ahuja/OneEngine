-- Phase 2: dedicated identity-verification audit and delegated MFA administration.
CREATE TABLE IF NOT EXISTS identity_verification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  method TEXT,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS','FAILURE','BLOCKED')),
  challenge_type TEXT,
  assurance_level TEXT,
  ip_address INET,
  user_agent TEXT,
  session_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ix_identity_verification_history_company_time
  ON identity_verification_history(company_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_identity_verification_history_user_time
  ON identity_verification_history(user_id,occurred_at DESC);

INSERT INTO permissions(code,name,description) VALUES
 ('security.mfa.manage','Manage Multi-Factor Authentication','Generate temporary verification codes, disconnect MFA methods, and administer trusted devices without broad settings administration'),
 ('security.identity_verification_history.view','View Identity Verification History','View identity verification events and methods for users in the company')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description;
