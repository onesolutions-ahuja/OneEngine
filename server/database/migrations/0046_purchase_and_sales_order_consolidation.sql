-- Canonical purchase ledger and sales order consolidation.
-- Preserve record IDs and existing foreign-key relationships while renaming
-- business-facing tables and metadata objects. Child/detail storage remains
-- internal and does not receive separate OneIDs.

DO $$
BEGIN
  IF to_regclass('public.purchases') IS NOT NULL
     AND to_regclass('public.purchase_ledger') IS NULL THEN
    ALTER TABLE purchases RENAME TO purchase_ledger;
  END IF;

  IF to_regclass('public.online_orders') IS NOT NULL
     AND to_regclass('public.sales_orders') IS NULL THEN
    ALTER TABLE online_orders RENAME TO sales_orders;
  END IF;

  IF to_regclass('public.online_order_items') IS NOT NULL
     AND to_regclass('public.sales_order_items') IS NULL THEN
    ALTER TABLE online_order_items RENAME TO sales_order_items;
  END IF;
END $$;

UPDATE platform_objects
SET object_key = 'purchase_ledger',
    api_name = CASE WHEN api_name = 'purchase' THEN 'purchase_ledger' ELSE api_name END,
    label = 'Purchase Ledger',
    plural_label = 'Purchase Ledger',
    description = 'Canonical purchasing transaction ledger.',
    source_table = 'purchase_ledger',
    updated_at = NOW()
WHERE object_key = 'purchase'
  AND NOT EXISTS (
    SELECT 1 FROM platform_objects existing
    WHERE existing.object_key = 'purchase_ledger'
      AND existing.id <> platform_objects.id
  );

UPDATE platform_objects
SET config = COALESCE(config, '{}'::jsonb)
           || '{"internal":true,"childStorage":true,"generateOneId":false}'::jsonb,
    updated_at = NOW()
WHERE object_key IN (
  'purchase_line',
  'purchase_receipt',
  'supplier_invoice',
  'supplier_payment',
  'supplier_payment_allocation'
);

UPDATE platform_objects
SET object_key = 'sales_order',
    api_name = CASE WHEN api_name = 'online_order' THEN 'sales_order' ELSE api_name END,
    label = 'Sales Order',
    plural_label = 'Sales Orders',
    description = 'Canonical sales order record.',
    source_table = 'sales_orders',
    updated_at = NOW()
WHERE object_key = 'online_order'
  AND NOT EXISTS (
    SELECT 1 FROM platform_objects existing
    WHERE existing.object_key = 'sales_order'
      AND existing.id <> platform_objects.id
  );

UPDATE platform_objects
SET object_key = 'sales_order_line',
    api_name = CASE WHEN api_name = 'online_order_line' THEN 'sales_order_line' ELSE api_name END,
    label = 'Sales Order Line',
    plural_label = 'Sales Order Lines',
    source_table = 'sales_order_items',
    config = COALESCE(config, '{}'::jsonb)
           || '{"internal":true,"childStorage":true,"generateOneId":false}'::jsonb,
    updated_at = NOW()
WHERE object_key = 'online_order_line'
  AND NOT EXISTS (
    SELECT 1 FROM platform_objects existing
    WHERE existing.object_key = 'sales_order_line'
      AND existing.id <> platform_objects.id
  );

UPDATE platform_fields
SET config = jsonb_set(
      COALESCE(config, '{}'::jsonb),
      '{relatedObjectKey}',
      to_jsonb(
        CASE config->>'relatedObjectKey'
          WHEN 'purchase' THEN 'purchase_ledger'
          WHEN 'online_order' THEN 'sales_order'
          WHEN 'online_order_line' THEN 'sales_order_line'
          ELSE config->>'relatedObjectKey'
        END
      ),
      true
    )
WHERE config->>'relatedObjectKey' IN ('purchase','online_order','online_order_line');
