ALTER TABLE identity_user_security_state
  ADD COLUMN IF NOT EXISTS locked_indefinitely BOOLEAN NOT NULL DEFAULT FALSE;
