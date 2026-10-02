-- Phase 2 device activation / trusted-device policy.
ALTER TABLE identity_security_settings
  ADD COLUMN IF NOT EXISTS device_activation_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skip_device_activation_on_trusted_network BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE identity_access_policies
  ADD COLUMN IF NOT EXISTS device_activation_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS skip_device_activation_on_trusted_network BOOLEAN;
