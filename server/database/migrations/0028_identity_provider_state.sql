-- Phase 2 authentication-provider transaction state.
CREATE TABLE IF NOT EXISTS identity_auth_provider_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES identity_auth_providers(id) ON DELETE CASCADE,
  state_token_hash TEXT NOT NULL UNIQUE,
  login_email TEXT,
  return_to TEXT NOT NULL,
  nonce TEXT,
  code_verifier_ciphertext TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_identity_auth_provider_states_provider ON identity_auth_provider_states(provider_id,expires_at);

CREATE TABLE IF NOT EXISTS identity_saml_request_cache (
  request_id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES identity_auth_providers(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
