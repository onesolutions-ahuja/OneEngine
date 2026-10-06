-- Canonical sale ledger migration.
-- Preserve sale ids and all existing foreign-key relationships while renaming
-- the business-facing transaction table and metadata object.

DO $$
BEGIN
  IF to_regclass('public.sales') IS NOT NULL
     AND to_regclass('public.sale_ledger') IS NULL THEN
    ALTER TABLE sales RENAME TO sale_ledger;
  END IF;
END $$;

-- Existing child tables remain as internal transaction storage. They are no
-- longer standalone OneEngine business objects and must not receive OneIDs.

UPDATE platform_objects
SET object_key = 'sale_ledger',
    api_name = CASE WHEN api_name = 'sale' THEN 'sale_ledger' ELSE api_name END,
    label = 'Sale Ledger',
    plural_label = 'Sale Ledger',
    description = 'Canonical sales transaction ledger.',
    source_table = 'sale_ledger',
    updated_at = NOW()
WHERE object_key = 'sale'
  AND NOT EXISTS (
    SELECT 1 FROM platform_objects existing
    WHERE existing.object_key = 'sale_ledger'
      AND existing.id <> platform_objects.id
  );

UPDATE platform_objects
SET config = COALESCE(config, '{}'::jsonb)
           || '{"internal":true,"childStorage":true,"generateOneId":false}'::jsonb,
    updated_at = NOW()
WHERE object_key IN ('sale_item','payment','refund');

-- Align lookup field metadata which stores the related object by key.
UPDATE platform_fields
SET config = jsonb_set(config, '{relatedObjectKey}', '"sale_ledger"', true)
WHERE config->>'relatedObjectKey' = 'sale';
