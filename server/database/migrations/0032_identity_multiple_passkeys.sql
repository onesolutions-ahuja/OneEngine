ALTER TABLE identity_mfa_methods
  DROP CONSTRAINT IF EXISTS identity_mfa_methods_user_id_method_type_label_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_mfa_passkey_credential
  ON identity_mfa_methods(credential_id)
  WHERE method_type='PASSKEY' AND credential_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_mfa_active_totp
  ON identity_mfa_methods(user_id)
  WHERE method_type='TOTP' AND active=TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_identity_mfa_active_recovery
  ON identity_mfa_methods(user_id)
  WHERE method_type='RECOVERY_CODES' AND active=TRUE;
