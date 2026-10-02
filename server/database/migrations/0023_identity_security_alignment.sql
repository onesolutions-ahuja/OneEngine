-- Phase 1 follow-up: preserve existing users and align password policy options.
ALTER TABLE identity_security_settings
  DROP CONSTRAINT IF EXISTS identity_security_settings_password_complexity_check;

UPDATE identity_security_settings SET password_complexity='ALPHA_NUMERIC' WHERE password_complexity='LETTER_NUMBER';
UPDATE identity_security_settings SET password_complexity='NUM_UPPER_LOWER_SPECIAL' WHERE password_complexity='ALL_FOUR';

ALTER TABLE identity_security_settings
  ADD CONSTRAINT identity_security_settings_password_complexity_check
  CHECK (password_complexity IN (
    'NONE',
    'ALPHA_NUMERIC',
    'ALPHA_NUMERIC_SPECIAL',
    'NUM_UPPER_LOWER',
    'NUM_UPPER_LOWER_SPECIAL',
    'THREE_OF_FOUR'
  ));

INSERT INTO identity_user_security_state(user_id,company_id,password_changed_at,updated_at)
SELECT u.id,u.company_id,NOW(),NOW()
FROM users u
ON CONFLICT(user_id) DO NOTHING;
