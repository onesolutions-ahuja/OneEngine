-- Phase 1 final alignment: additional Salesforce access/session/login-history controls.
ALTER TABLE identity_security_settings
  ADD COLUMN IF NOT EXISTS lockout_forever BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lock_session_to_domain BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS force_logout_on_timeout BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS session_timeout_warning_minutes INTEGER NOT NULL DEFAULT 5;

ALTER TABLE identity_security_settings
  DROP CONSTRAINT IF EXISTS identity_security_settings_session_timeout_warning_check;
ALTER TABLE identity_security_settings
  ADD CONSTRAINT identity_security_settings_session_timeout_warning_check
  CHECK (session_timeout_warning_minutes BETWEEN 0 AND 60);

ALTER TABLE identity_sessions
  ADD COLUMN IF NOT EXISTS origin_host TEXT;

ALTER TABLE identity_login_history
  ADD COLUMN IF NOT EXISTS forwarded_for TEXT,
  ADD COLUMN IF NOT EXISTS login_type TEXT,
  ADD COLUMN IF NOT EXISTS application TEXT,
  ADD COLUMN IF NOT EXISTS login_url TEXT,
  ADD COLUMN IF NOT EXISTS tls_protocol TEXT,
  ADD COLUMN IF NOT EXISTS tls_cipher TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS browser TEXT;
