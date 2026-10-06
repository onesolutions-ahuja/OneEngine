-- Canonical Sale Ledger migration.
-- Non-destructive first stage: populate the canonical ledger while legacy tables
-- remain available until all runtime references have been migrated.

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
  source_record_type VARCHAR(30) NOT NULL DEFAULT 'SALE',

  receipt_number VARCHAR(100),
  product_name VARCHAR(255),
  quantity NUMERIC(12,3),
  line_count INTEGER,
  unit_price NUMERIC(12,2),
  subtotal NUMERIC(12,2),
  tax NUMERIC(12,2),
  discount NUMERIC(12,2),
  total NUMERIC(12,2),
  amount NUMERIC(12,2),
  net_amount NUMERIC(12,2),

  transaction_type VARCHAR(30) NOT NULL DEFAULT 'SALE',
  item_type VARCHAR(30),
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
CREATE INDEX IF NOT EXISTS idx_sale_ledger_company_store_date ON sale_ledger(company_id, store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_ledger_product ON sale_ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_ledger_type ON sale_ledger(company_id, transaction_type, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_ledger_client_request
  ON sale_ledger(company_id, client_request_id)
  WHERE client_request_id IS NOT NULL AND source_record_type='SALE_HEADER';

-- One canonical ledger row per historical sale line.
INSERT INTO sale_ledger (
  company_id, store_id, terminal_id, user_id, customer_id, product_id,
  transaction_id, source_record_id, source_record_type,
  receipt_number, product_name, quantity, unit_price, subtotal, tax, discount, total, net_amount,
  transaction_type, item_type, status,
  payment_method, payment_reference, payment_status, payment_data,
  modifier_data, bundle_components,
  offline_created, sync_status, client_request_id, client_request_fingerprint, original_transaction_id,
  created_at, completed_at, migrated_at
)
SELECT
  s.company_id, s.store_id, s.terminal_id, s.user_id, s.customer_id, si.product_id,
  s.id, si.id, 'SALE_LINE',
  s.receipt_number, si.product_name, si.quantity, si.unit_price, s.subtotal, si.tax, si.discount, si.total,
  COALESCE(s.net_amount, s.total),
  COALESCE(s.transaction_type, 'SALE'), si.item_type, s.status,
  p.first_payment_method, p.first_reference, p.first_status, COALESCE(p.payment_data, '[]'::jsonb),
  COALESCE(si.modifier_data, '[]'::jsonb), COALESCE(si.bundle_components, '[]'::jsonb),
  COALESCE(s.offline_created, FALSE), s.sync_status, s.client_request_id, s.client_request_fingerprint, s.original_transaction_id,
  s.created_at, s.completed_at, NOW()
FROM sales s
JOIN sale_items si ON si.sale_id=s.id
LEFT JOIN LATERAL (
  SELECT
    MIN(pay.payment_method) AS first_payment_method,
    MIN(pay.reference) AS first_reference,
    MIN(pay.status) AS first_status,
    jsonb_agg(jsonb_build_object(
      'id', pay.id,
      'method', pay.payment_method,
      'amount', pay.amount,
      'status', pay.status,
      'reference', pay.reference,
      'provider', pay.provider,
      'providerTransactionId', pay.provider_transaction_id,
      'direction', pay.direction
    ) ORDER BY pay.created_at, pay.id) AS payment_data
  FROM payments pay
  WHERE pay.sale_id=s.id OR pay.transaction_id=s.id
) p ON TRUE
ON CONFLICT (source_record_type, source_record_id) DO NOTHING;

-- Preserve historical sale headers which legitimately have no line rows.
INSERT INTO sale_ledger (
  company_id, store_id, terminal_id, user_id, customer_id,
  transaction_id, source_record_id, source_record_type,
  receipt_number, subtotal, tax, discount, total, net_amount,
  transaction_type, status,
  payment_method, payment_reference, payment_status, payment_data,
  offline_created, sync_status, client_request_id, client_request_fingerprint, original_transaction_id,
  created_at, completed_at, migrated_at
)
SELECT
  s.company_id, s.store_id, s.terminal_id, s.user_id, s.customer_id,
  s.id, s.id, 'SALE_HEADER',
  s.receipt_number, s.subtotal, s.tax, s.discount, s.total, COALESCE(s.net_amount, s.total),
  COALESCE(s.transaction_type, 'SALE'), s.status,
  p.first_payment_method, p.first_reference, p.first_status, COALESCE(p.payment_data, '[]'::jsonb),
  COALESCE(s.offline_created, FALSE), s.sync_status, s.client_request_id, s.client_request_fingerprint, s.original_transaction_id,
  s.created_at, s.completed_at, NOW()
FROM sales s
LEFT JOIN sale_items si ON si.sale_id=s.id
LEFT JOIN LATERAL (
  SELECT
    MIN(pay.payment_method) AS first_payment_method,
    MIN(pay.reference) AS first_reference,
    MIN(pay.status) AS first_status,
    jsonb_agg(jsonb_build_object(
      'id', pay.id,
      'method', pay.payment_method,
      'amount', pay.amount,
      'status', pay.status,
      'reference', pay.reference,
      'provider', pay.provider,
      'providerTransactionId', pay.provider_transaction_id,
      'direction', pay.direction
    ) ORDER BY pay.created_at, pay.id) AS payment_data
  FROM payments pay
  WHERE pay.sale_id=s.id OR pay.transaction_id=s.id
) p ON TRUE
WHERE si.id IS NULL
ON CONFLICT (source_record_type, source_record_id) DO NOTHING;

-- Refunds become ledger entries rather than a separate business object.
INSERT INTO sale_ledger (
  company_id, store_id, terminal_id, user_id, customer_id,
  transaction_id, source_record_id, source_record_type,
  receipt_number, quantity, total, net_amount,
  transaction_type, status, payment_method, reason,
  original_transaction_id, created_at, completed_at, migrated_at
)
SELECT
  s.company_id, s.store_id, s.terminal_id, r.user_id, s.customer_id,
  s.id, r.id, 'REFUND',
  s.receipt_number, -1, -ABS(r.amount), -ABS(r.amount),
  'SALE_RETURN', 'completed', r.payment_method, r.reason,
  s.id, r.created_at, r.created_at, NOW()
FROM refunds r
JOIN sales s ON s.id=r.sale_id
ON CONFLICT (source_record_type, source_record_id) DO NOTHING;
