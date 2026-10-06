-- Canonical OneEngine data-schema renames.
-- This migration preserves existing data and moves physical storage to the
-- canonical ledger/device table names selected for the metadata model.

DO $$
BEGIN
  IF to_regclass('public.hardware_configurations') IS NOT NULL
     AND to_regclass('public.hardware_devices') IS NULL THEN
    ALTER TABLE hardware_configurations RENAME TO hardware_devices;
  END IF;

  IF to_regclass('public.inventory_movements') IS NOT NULL
     AND to_regclass('public.inventory_ledger') IS NULL THEN
    ALTER TABLE inventory_movements RENAME TO inventory_ledger;
  END IF;

  IF to_regclass('public.customer_credit_ledger') IS NOT NULL
     AND to_regclass('public.customer_ledger') IS NULL THEN
    ALTER TABLE customer_credit_ledger RENAME TO customer_ledger;
  END IF;

  IF to_regclass('public.customer_loyalty_transactions') IS NOT NULL
     AND to_regclass('public.customer_loyalty_ledger') IS NULL THEN
    ALTER TABLE customer_loyalty_transactions RENAME TO customer_loyalty_ledger;
  END IF;

  IF to_regclass('public.gift_card_transactions') IS NOT NULL
     AND to_regclass('public.gift_card_ledger') IS NULL THEN
    ALTER TABLE gift_card_transactions RENAME TO gift_card_ledger;
  END IF;

  IF to_regclass('public.till_sessions') IS NOT NULL
     AND to_regclass('public.device_sessions') IS NULL THEN
    ALTER TABLE till_sessions RENAME TO device_sessions;
  END IF;

  IF to_regclass('public.cash_movements') IS NOT NULL
     AND to_regclass('public.cash_ledger') IS NULL THEN
    ALTER TABLE cash_movements RENAME TO cash_ledger;
  END IF;
END $$;

-- Keep already-installed metadata aligned with the physical rename.
UPDATE platform_objects
SET source_table = CASE source_table
  WHEN 'hardware_configurations' THEN 'hardware_devices'
  WHEN 'inventory_movements' THEN 'inventory_ledger'
  WHEN 'customer_credit_ledger' THEN 'customer_ledger'
  WHEN 'customer_loyalty_transactions' THEN 'customer_loyalty_ledger'
  WHEN 'gift_card_transactions' THEN 'gift_card_ledger'
  WHEN 'till_sessions' THEN 'device_sessions'
  WHEN 'cash_movements' THEN 'cash_ledger'
  ELSE source_table
END,
updated_at = NOW()
WHERE source_table IN (
  'hardware_configurations',
  'inventory_movements',
  'customer_credit_ledger',
  'customer_loyalty_transactions',
  'gift_card_transactions',
  'till_sessions',
  'cash_movements'
);

-- Canonical metadata object keys for non-absorbed objects in this pass.
UPDATE platform_objects
SET object_key = 'inventory_ledger',
    api_name = CASE WHEN api_name = 'inventory_movement' THEN 'inventory_ledger' ELSE api_name END,
    updated_at = NOW()
WHERE object_key = 'inventory_movement'
  AND NOT EXISTS (SELECT 1 FROM platform_objects x WHERE x.object_key = 'inventory_ledger');

UPDATE platform_objects
SET object_key = 'device_session',
    api_name = CASE WHEN api_name = 'till_session' THEN 'device_session' ELSE api_name END,
    updated_at = NOW()
WHERE object_key = 'till_session'
  AND NOT EXISTS (SELECT 1 FROM platform_objects x WHERE x.object_key = 'device_session');

UPDATE platform_objects
SET object_key = 'cash_ledger',
    api_name = CASE WHEN api_name = 'cash_movement' THEN 'cash_ledger' ELSE api_name END,
    updated_at = NOW()
WHERE object_key = 'cash_movement'
  AND NOT EXISTS (SELECT 1 FROM platform_objects x WHERE x.object_key = 'cash_ledger');

UPDATE platform_objects
SET object_key = 'customer_ledger',
    api_name = CASE WHEN api_name = 'customer_credit_ledger' THEN 'customer_ledger' ELSE api_name END,
    updated_at = NOW()
WHERE object_key = 'customer_credit_ledger'
  AND NOT EXISTS (SELECT 1 FROM platform_objects x WHERE x.object_key = 'customer_ledger');
