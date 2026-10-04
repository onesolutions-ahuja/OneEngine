DO $$
BEGIN
  IF to_regclass('public.cash_movements') IS NOT NULL AND to_regclass('public.cash_ledger') IS NULL THEN
    ALTER TABLE public.cash_movements RENAME TO cash_ledger;
  END IF;

  IF to_regclass('public.customer_credit_ledger') IS NOT NULL AND to_regclass('public.customer_ledger') IS NULL THEN
    ALTER TABLE public.customer_credit_ledger RENAME TO customer_ledger;
  END IF;

  IF to_regclass('public.customer_loyalty_transactions') IS NOT NULL AND to_regclass('public.customer_loyalty_ledger') IS NULL THEN
    ALTER TABLE public.customer_loyalty_transactions RENAME TO customer_loyalty_ledger;
  END IF;

  IF to_regclass('public.gift_card_transactions') IS NOT NULL AND to_regclass('public.gift_card_ledger') IS NULL THEN
    ALTER TABLE public.gift_card_transactions RENAME TO gift_card_ledger;
  END IF;

  IF to_regclass('public.hardware_configurations') IS NOT NULL AND to_regclass('public.hardware_devices') IS NULL THEN
    ALTER TABLE public.hardware_configurations RENAME TO hardware_devices;
  END IF;

  IF to_regclass('public.inventory_movements') IS NOT NULL AND to_regclass('public.inventory_ledger') IS NULL THEN
    ALTER TABLE public.inventory_movements RENAME TO inventory_ledger;
  END IF;

  IF to_regclass('public.onesolutions_business_divisions') IS NOT NULL AND to_regclass('public.business_divisions') IS NULL THEN
    ALTER TABLE public.onesolutions_business_divisions RENAME TO business_divisions;
  END IF;

  IF to_regclass('public.purchase_receipts') IS NOT NULL AND to_regclass('public.purchase_ledger') IS NULL THEN
    ALTER TABLE public.purchase_receipts RENAME TO purchase_ledger;
  END IF;
END $$;

UPDATE platform_objects
SET source_table = CASE source_table
  WHEN 'cash_movements' THEN 'cash_ledger'
  WHEN 'customer_credit_ledger' THEN 'customer_ledger'
  WHEN 'customer_loyalty_transactions' THEN 'customer_loyalty_ledger'
  WHEN 'gift_card_transactions' THEN 'gift_card_ledger'
  WHEN 'hardware_configurations' THEN 'hardware_devices'
  WHEN 'inventory_movements' THEN 'inventory_ledger'
  WHEN 'onesolutions_business_divisions' THEN 'business_divisions'
  WHEN 'purchase_receipts' THEN 'purchase_ledger'
  ELSE source_table
END,
updated_at = NOW()
WHERE source_table IN (
  'cash_movements',
  'customer_credit_ledger',
  'customer_loyalty_transactions',
  'gift_card_transactions',
  'hardware_configurations',
  'inventory_movements',
  'onesolutions_business_divisions',
  'purchase_receipts'
);
