-- Enable tenant-controlled passwordless passkey sign-in.
ALTER TABLE identity_security_settings
  ADD COLUMN IF NOT EXISTS allow_passkey_login BOOLEAN NOT NULL DEFAULT TRUE;
