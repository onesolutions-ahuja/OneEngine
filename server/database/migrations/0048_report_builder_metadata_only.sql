-- Remove legacy code-defined report surfaces. Report Builder metadata is the only report definition authority.
DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'reports.sales.view','reports.products.view','reports.customers.view',
    'reports.inventory.view','reports.inventory_ledger.view','reports.low_stock.view',
    'reports.payments.view','reports.purchases.view','reports.returns.view',
    'reports.till.view','reports.vat.view','reports.summary.view'
  )
);

DELETE FROM permissions WHERE code IN (
  'reports.sales.view','reports.products.view','reports.customers.view',
  'reports.inventory.view','reports.inventory_ledger.view','reports.low_stock.view',
  'reports.payments.view','reports.purchases.view','reports.returns.view',
  'reports.till.view','reports.vat.view','reports.summary.view'
);

-- Legacy sales-source reports were predefined report behavior. Builder reports use platform objects.
DELETE FROM report_subscriptions WHERE report_id IN (SELECT id FROM custom_reports WHERE data_source='sales');
DELETE FROM report_favourites WHERE report_id IN (SELECT id FROM custom_reports WHERE data_source='sales');
DELETE FROM report_run_history WHERE report_id IN (SELECT id FROM custom_reports WHERE data_source='sales');
DELETE FROM custom_reports WHERE data_source='sales';

ALTER TABLE custom_reports DROP CONSTRAINT IF EXISTS custom_reports_data_source_check;
ALTER TABLE custom_reports ALTER COLUMN data_source SET DEFAULT 'platform_object';
ALTER TABLE custom_reports ADD CONSTRAINT custom_reports_data_source_check CHECK (data_source='platform_object');
