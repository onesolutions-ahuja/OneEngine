-- Canonical Sale Ledger migration.
-- Stage 1 preserves every existing sales identifier while moving sale headers,
-- lines, sale-linked payments and refunds into one physical ledger table.

CREATE TABLE IF NOT EXISTS sale_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  sale_id UUID,
  return_id UUID,
  transaction_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_record_id UUID,
  source_record_type VARCHAR(30) NOT NULL DEFAULT 'SALE_HEADER',

  receipt_number VARCHAR(100),
  product_name VARCHAR(255),
  quantity NUMERIC(12,3),
  unit_price NUMERIC(12,2),
  line_count INTEGER,
  subtotal NUMERIC(12,2),
  tax NUMERIC(12,2),
  discount NUMERIC(12,2),
  total NUMERIC(12,2),
  amount NUMERIC(12,2),
  net_amount NUMERIC(12,2),

  transaction_type VARCHAR(30) NOT NULL DEFAULT 'SALE',
  item_type VARCHAR(30),
  discount_type VARCHAR(20),
  discount_value NUMERIC(12,2),
  original_unit_price NUMERIC(12,2),
  original_tax NUMERIC(12,2),
  original_total NUMERIC(12,2),
  discounted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50),

  payment_method VARCHAR(50),
  direction VARCHAR(20),
  reference VARCHAR(100),
  provider VARCHAR(100),
  provider_transaction_id VARCHAR(255),
  idempotency_key VARCHAR(200),
  payment_reference VARCHAR(255),
  payment_status VARCHAR(50),
  payment_data JSONB NOT NULL DEFAULT '[]'::jsonb,

  reason TEXT,
  modifier_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  bundle_components JSONB NOT NULL DEFAULT '[]'::jsonb,

  offline_created BOOLEAN NOT NULL DEFAULT FALSE,
  sync_status VARCHAR(50),
  client_request_id UUID,
  client_request_fingerprint TEXT,
  original_transaction_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  migrated_at TIMESTAMPTZ,

  UNIQUE(source_record_type, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_sale_ledger_transaction ON sale_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_sale_ledger_sale ON sale_ledger(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_ledger_company_store_date ON sale_ledger(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_ledger_product ON sale_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_ledger_type ON sale_ledger(company_id, transaction_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_ledger_client_request
  ON sale_ledger(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND source_record_type='SALE_HEADER';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_ledger_idempotency
  ON sale_ledger(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND source_record_type='PAYMENT';

-- Preserve every historical sale header using the SAME id.
INSERT INTO sale_ledger (
  id, company_id, store_id, terminal_id, user_id, customer_id,
  sale_id, transaction_id, source_record_id, source_record_type,
  receipt_number, line_count, subtotal, tax, discount, total, net_amount,
  transaction_type, status, payment_data,
  offline_created, sync_status, client_request_id, client_request_fingerprint, original_transaction_id,
  created_at, completed_at, migrated_at
)
SELECT
  s.id, s.company_id, s.store_id, s.terminal_id, s.user_id, s.customer_id,
  s.id, s.id, s.id, 'SALE_HEADER',
  s.receipt_number, COALESCE(s.line_count,0), s.subtotal, s.tax, s.discount, s.total, COALESCE(s.net_amount,s.total),
  COALESCE(s.transaction_type,'SALE'), s.status,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', p.id,
      'method', p.payment_method,
      'amount', p.amount,
      'status', p.status,
      'reference', p.reference,
      'provider', p.provider,
      'providerTransactionId', p.provider_transaction_id,
      'direction', p.direction
    ) ORDER BY p.created_at,p.id)
    FROM payments p
    WHERE p.sale_id=s.id OR p.transaction_id=s.id
  ), '[]'::jsonb),
  COALESCE(s.offline_created,FALSE), s.sync_status, s.client_request_id, s.client_request_fingerprint, s.original_transaction_id,
  s.created_at, s.completed_at, NOW()
FROM sales s
ON CONFLICT (id) DO NOTHING;

-- Preserve each historical line using the SAME sale_item id.
INSERT INTO sale_ledger (
  id, company_id, store_id, terminal_id, user_id, customer_id, product_id,
  sale_id, transaction_id, source_record_id, source_record_type,
  receipt_number, product_name, quantity, unit_price, tax, discount, total,
  transaction_type, item_type, discount_type, discount_value, original_unit_price, original_tax, original_total, discounted_by, status,
  modifier_data, bundle_components,
  offline_created, sync_status, original_transaction_id,
  created_at, completed_at, migrated_at
)
SELECT
  si.id, s.company_id, s.store_id, s.terminal_id, s.user_id, s.customer_id, si.product_id,
  s.id, s.id, si.id, 'SALE_LINE',
  s.receipt_number, si.product_name, si.quantity, si.unit_price, si.tax, si.discount, si.total,
  COALESCE(s.transaction_type,'SALE'), si.item_type, si.discount_type, si.discount_value, si.original_unit_price, si.original_tax, si.original_total, si.discounted_by, s.status,
  COALESCE(si.modifier_data,'[]'::jsonb), COALESCE(si.bundle_components,'[]'::jsonb),
  COALESCE(s.offline_created,FALSE), s.sync_status, s.original_transaction_id,
  s.created_at, s.completed_at, NOW()
FROM sale_items si
JOIN sales s ON s.id=si.sale_id
ON CONFLICT (id) DO NOTHING;

-- Sale-linked tender rows also live in the same ledger and keep their IDs.
INSERT INTO sale_ledger (
  id, company_id, store_id, terminal_id, customer_id,
  sale_id, transaction_id, source_record_id, source_record_type,
  transaction_type, status, payment_method, direction, reference, amount,
  provider, provider_transaction_id, idempotency_key,
  created_at, completed_at, migrated_at
)
SELECT
  p.id,
  COALESCE(p.company_id,s.company_id),
  COALESCE(p.store_id,s.store_id),
  s.terminal_id,
  COALESCE(p.customer_id,s.customer_id),
  COALESCE(p.sale_id,p.transaction_id),
  COALESCE(p.transaction_id,p.sale_id),
  p.id,
  'PAYMENT',
  'PAYMENT',
  p.status,
  p.payment_method,
  p.direction,
  p.reference,
  p.amount,
  p.provider,
  p.provider_transaction_id,
  p.idempotency_key,
  p.created_at,
  p.created_at,
  NOW()
FROM payments p
LEFT JOIN sales s ON s.id=COALESCE(p.sale_id,p.transaction_id)
WHERE p.sale_id IS NOT NULL OR p.transaction_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Refunds become negative sale-ledger entries and keep their historical IDs.
INSERT INTO sale_ledger (
  id, company_id, store_id, terminal_id, user_id, customer_id,
  sale_id, return_id, transaction_id, source_record_id, source_record_type,
  receipt_number, quantity, amount, total, net_amount,
  transaction_type, status, payment_method, reason,
  original_transaction_id, created_at, completed_at, migrated_at
)
SELECT
  r.id, s.company_id, s.store_id, s.terminal_id, r.user_id, s.customer_id,
  s.id, r.return_id, s.id, r.id, 'REFUND',
  s.receipt_number, -1, -ABS(r.amount), -ABS(r.amount), -ABS(r.amount),
  'SALE_RETURN', 'completed', r.payment_method, r.reason,
  s.id, r.created_at, r.created_at, NOW()
FROM refunds r
JOIN sales s ON s.id=r.sale_id
ON CONFLICT (id) DO NOTHING;


-- Repoint surviving references to the canonical ledger. IDs were deliberately
-- preserved above, so this changes ownership without changing referenced values.
DO $$
DECLARE fk RECORD;
BEGIN
  IF to_regclass('public.sale_ledger') IS NULL THEN RETURN; END IF;

  -- sale/header references
  FOR fk IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype='f' AND confrelid=to_regclass('public.sales')
      AND conrelid = ANY(ARRAY[
        to_regclass('public.secure_invoice_links'),
        to_regclass('public.temporary_receipt_downloads'),
        to_regclass('public.payment_attempts'),
        to_regclass('public.hospitality_bill_sales'),
        to_regclass('public.financial_ledger_entries'),
        to_regclass('public.layaways'),
        to_regclass('public.sale_discounts'),
        to_regclass('public.sale_price_overrides'),
        to_regclass('public.hospitality_qr_orders')
      ]::oid[])
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
  END LOOP;

  -- line references
  FOR fk IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype='f' AND confrelid=to_regclass('public.sale_items')
      AND conrelid = ANY(ARRAY[
        to_regclass('public.sale_item_modifiers'),
        to_regclass('public.hospitality_bill_split_items'),
        to_regclass('public.sale_discounts'),
        to_regclass('public.sale_price_overrides')
      ]::oid[])
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
  END LOOP;

  -- payment references
  FOR fk IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE contype='f' AND confrelid=to_regclass('public.payments')
      AND conrelid = to_regclass('public.financial_ledger_entries')
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.secure_invoice_links') IS NOT NULL THEN
    ALTER TABLE secure_invoice_links DROP CONSTRAINT IF EXISTS fk_secure_invoice_links_sale_ledger;
    ALTER TABLE secure_invoice_links ADD CONSTRAINT fk_secure_invoice_links_sale_ledger FOREIGN KEY (sale_id) REFERENCES sale_ledger(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.temporary_receipt_downloads') IS NOT NULL THEN
    ALTER TABLE temporary_receipt_downloads DROP CONSTRAINT IF EXISTS fk_temporary_receipt_sale_ledger;
    ALTER TABLE temporary_receipt_downloads ADD CONSTRAINT fk_temporary_receipt_sale_ledger FOREIGN KEY (sale_id) REFERENCES sale_ledger(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.payment_attempts') IS NOT NULL THEN
    ALTER TABLE payment_attempts DROP CONSTRAINT IF EXISTS fk_payment_attempt_sale_ledger;
    ALTER TABLE payment_attempts ADD CONSTRAINT fk_payment_attempt_sale_ledger FOREIGN KEY (sale_id) REFERENCES sale_ledger(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.hospitality_bill_sales') IS NOT NULL THEN
    ALTER TABLE hospitality_bill_sales DROP CONSTRAINT IF EXISTS fk_hospitality_bill_sale_ledger;
    ALTER TABLE hospitality_bill_sales DROP CONSTRAINT IF EXISTS fk_hospitality_bill_source_sale_ledger;
    ALTER TABLE hospitality_bill_sales ADD CONSTRAINT fk_hospitality_bill_sale_ledger FOREIGN KEY (sale_id) REFERENCES sale_ledger(id) ON DELETE RESTRICT;
    ALTER TABLE hospitality_bill_sales ADD CONSTRAINT fk_hospitality_bill_source_sale_ledger FOREIGN KEY (source_sale_id) REFERENCES sale_ledger(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.financial_ledger_entries') IS NOT NULL THEN
    ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS fk_financial_transaction_sale_ledger;
    ALTER TABLE financial_ledger_entries DROP CONSTRAINT IF EXISTS fk_financial_payment_sale_ledger;
    ALTER TABLE financial_ledger_entries ADD CONSTRAINT fk_financial_transaction_sale_ledger FOREIGN KEY (transaction_id) REFERENCES sale_ledger(id) ON DELETE SET NULL;
    ALTER TABLE financial_ledger_entries ADD CONSTRAINT fk_financial_payment_sale_ledger FOREIGN KEY (payment_id) REFERENCES sale_ledger(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.layaways') IS NOT NULL THEN
    ALTER TABLE layaways DROP CONSTRAINT IF EXISTS fk_layaway_sale_ledger;
    ALTER TABLE layaways ADD CONSTRAINT fk_layaway_sale_ledger FOREIGN KEY (completed_sale_id) REFERENCES sale_ledger(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.sale_discounts') IS NOT NULL THEN
    ALTER TABLE sale_discounts DROP CONSTRAINT IF EXISTS fk_sale_discount_sale_ledger;
    ALTER TABLE sale_discounts DROP CONSTRAINT IF EXISTS fk_sale_discount_item_ledger;
    ALTER TABLE sale_discounts ADD CONSTRAINT fk_sale_discount_sale_ledger FOREIGN KEY (sale_id) REFERENCES sale_ledger(id) ON DELETE CASCADE;
    ALTER TABLE sale_discounts ADD CONSTRAINT fk_sale_discount_item_ledger FOREIGN KEY (item_id) REFERENCES sale_ledger(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.sale_price_overrides') IS NOT NULL THEN
    ALTER TABLE sale_price_overrides DROP CONSTRAINT IF EXISTS fk_sale_override_sale_ledger;
    ALTER TABLE sale_price_overrides DROP CONSTRAINT IF EXISTS fk_sale_override_item_ledger;
    ALTER TABLE sale_price_overrides ADD CONSTRAINT fk_sale_override_sale_ledger FOREIGN KEY (sale_id) REFERENCES sale_ledger(id) ON DELETE CASCADE;
    ALTER TABLE sale_price_overrides ADD CONSTRAINT fk_sale_override_item_ledger FOREIGN KEY (item_id) REFERENCES sale_ledger(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.sale_item_modifiers') IS NOT NULL THEN
    ALTER TABLE sale_item_modifiers DROP CONSTRAINT IF EXISTS fk_sale_item_modifier_ledger;
    ALTER TABLE sale_item_modifiers ADD CONSTRAINT fk_sale_item_modifier_ledger FOREIGN KEY (sale_item_id) REFERENCES sale_ledger(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.hospitality_bill_split_items') IS NOT NULL THEN
    ALTER TABLE hospitality_bill_split_items DROP CONSTRAINT IF EXISTS fk_hospitality_source_item_ledger;
    ALTER TABLE hospitality_bill_split_items DROP CONSTRAINT IF EXISTS fk_hospitality_split_item_ledger;
    ALTER TABLE hospitality_bill_split_items ADD CONSTRAINT fk_hospitality_source_item_ledger FOREIGN KEY (source_sale_item_id) REFERENCES sale_ledger(id) ON DELETE RESTRICT;
    ALTER TABLE hospitality_bill_split_items ADD CONSTRAINT fk_hospitality_split_item_ledger FOREIGN KEY (split_sale_item_id) REFERENCES sale_ledger(id) ON DELETE RESTRICT;
  END IF;
  IF to_regclass('public.hospitality_qr_orders') IS NOT NULL THEN
    ALTER TABLE hospitality_qr_orders DROP CONSTRAINT IF EXISTS fk_hospitality_qr_sale_ledger;
    ALTER TABLE hospitality_qr_orders ADD CONSTRAINT fk_hospitality_qr_sale_ledger FOREIGN KEY (sale_id) REFERENCES sale_ledger(id) ON DELETE SET NULL;
  END IF;
END $$;
