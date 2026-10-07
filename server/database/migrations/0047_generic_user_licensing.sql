-- Retire the legacy Jarvis-specific seat/user flags in favour of the canonical
-- company_licence_allocations + user_licence_assignments model.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='users' AND column_name='jarves_enabled'
  ) THEN
    INSERT INTO user_licence_assignments(user_id,company_id,licence_id,assigned_at,active)
    SELECT u.id,u.company_id,chosen.licence_id,NOW(),true
      FROM users u
      JOIN LATERAL (
        SELECT a.licence_id
          FROM company_licence_allocations a
          JOIN licence_entitlements e ON e.licence_id=a.licence_id
         WHERE a.company_id=u.company_id
           AND a.active=true
           AND a.seats>0
           AND e.entitlement_key='jarvis'
           AND e.enabled=true
           AND (a.starts_at IS NULL OR a.starts_at<=NOW())
           AND (a.expires_at IS NULL OR a.expires_at>NOW())
         ORDER BY (a.licence_id=(SELECT c.licence_id FROM companies c WHERE c.id=u.company_id)) DESC,
                  a.updated_at DESC
         LIMIT 1
      ) chosen ON true
     WHERE u.jarves_enabled=true
       AND NOT EXISTS (SELECT 1 FROM user_licence_assignments x WHERE x.user_id=u.id)
    ON CONFLICT(user_id) DO NOTHING;
  END IF;
END $$;

ALTER TABLE users DROP COLUMN IF EXISTS jarves_enabled;
ALTER TABLE company_settings DROP COLUMN IF EXISTS jarves_licence_users;
