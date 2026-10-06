-- Consolidate approved canonical objects in one pass.
-- 1) Simple table renames preserve IDs and all dependent FK OIDs.
DO $$
BEGIN
  IF to_regclass('public.device_sessions') IS NULL AND to_regclass('public.till_sessions') IS NOT NULL THEN
    ALTER TABLE till_sessions RENAME TO device_sessions;
  END IF;
  IF to_regclass('public.cash_ledger') IS NULL AND to_regclass('public.cash_movements') IS NOT NULL THEN
    ALTER TABLE cash_movements RENAME TO cash_ledger;
  END IF;
  IF to_regclass('public.inventory_ledger') IS NULL AND to_regclass('public.inventory_movements') IS NOT NULL THEN
    ALTER TABLE inventory_movements RENAME TO inventory_ledger;
  END IF;
END $$;

-- 2) Purchase Ledger: purchases, lines, receipts, supplier invoices and supplier
-- payments become rows of one canonical ledger. Existing IDs are preserved.
CREATE TABLE IF NOT EXISTS purchase_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  purchase_id UUID,
  transaction_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_record_id UUID,
  source_record_type VARCHAR(40) NOT NULL,
  supplier_name VARCHAR(200),
  reference_number VARCHAR(100),
  purchase_date DATE,
  invoice_number VARCHAR(100),
  invoice_date DATE,
  due_date DATE,
  payment_date DATE,
  payment_method VARCHAR(50),
  quantity NUMERIC(12,3),
  received_quantity NUMERIC(12,3),
  returned_quantity NUMERIC(12,3),
  remaining_returnable NUMERIC(12,3),
  unit_cost NUMERIC(12,2),
  line_total NUMERIC(12,2),
  batch_number VARCHAR(100),
  manufacturing_date DATE,
  expiry_date DATE,
  subtotal NUMERIC(12,2),
  tax NUMERIC(12,2),
  total NUMERIC(12,2),
  amount NUMERIC(12,2),
  paid_amount NUMERIC(12,2),
  outstanding_amount NUMERIC(12,2),
  status VARCHAR(40),
  notes TEXT,
  idempotency_key VARCHAR(100),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  allocation_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  migrated_at TIMESTAMPTZ,
  UNIQUE(source_record_type, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_purchase_ledger_transaction ON purchase_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_purchase_ledger_company_date ON purchase_ledger(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_ledger_supplier ON purchase_ledger(company_id, supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_ledger_product ON purchase_ledger(product_id);

INSERT INTO purchase_ledger (
  id,company_id,store_id,supplier_id,purchase_id,transaction_id,source_record_id,source_record_type,
  supplier_name,reference_number,purchase_date,notes,status,subtotal,total,created_by,received_by,received_at,
  created_at,updated_at,migrated_at
)
SELECT p.id,p.company_id,p.store_id,p.supplier_id,p.id,p.id,p.id,'PURCHASE_HEADER',
       p.supplier_name,p.reference_number,p.purchase_date,p.notes,p.status,p.subtotal,p.total,p.created_by,p.received_by,p.received_at,
       p.created_at,p.updated_at,NOW()
FROM purchases p
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_ledger (
  id,company_id,store_id,supplier_id,product_id,purchase_id,transaction_id,source_record_id,source_record_type,
  quantity,received_quantity,returned_quantity,remaining_returnable,unit_cost,line_total,batch_number,manufacturing_date,expiry_date,
  status,created_at,migrated_at
)
SELECT pi.id,p.company_id,p.store_id,p.supplier_id,pi.product_id,pi.purchase_id,pi.purchase_id,pi.id,'PURCHASE_LINE',
       pi.quantity,pi.received_quantity,
       NULLIF(to_jsonb(pi)->>'returned_quantity','')::numeric,
       NULLIF(to_jsonb(pi)->>'remaining_returnable','')::numeric,
       pi.unit_cost,pi.line_total,pi.batch_number,pi.manufacturing_date,pi.expiry_date,
       p.status,p.created_at,NOW()
FROM purchase_items pi JOIN purchases p ON p.id=pi.purchase_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_ledger (
  id,company_id,store_id,purchase_id,transaction_id,source_record_id,source_record_type,
  reference_number,notes,received_by,received_at,created_at,migrated_at
)
SELECT pr.id,pr.company_id,pr.store_id,pr.purchase_id,pr.purchase_id,pr.id,'PURCHASE_RECEIPT',
       pr.reference_number,pr.notes,pr.received_by,pr.received_at,pr.received_at,NOW()
FROM purchase_receipts pr
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_ledger (
  id,company_id,store_id,supplier_id,product_id,purchase_id,transaction_id,source_record_id,source_record_type,
  quantity,unit_cost,batch_number,manufacturing_date,expiry_date,received_at,created_at,migrated_at
)
SELECT pri.id,pr.company_id,pr.store_id,p.supplier_id,pri.product_id,pr.purchase_id,pr.purchase_id,pri.id,'PURCHASE_RECEIPT_LINE',
       pri.quantity,pri.unit_cost,pri.batch_number,pri.manufacturing_date,pri.expiry_date,pr.received_at,pr.received_at,NOW()
FROM purchase_receipt_items pri
JOIN purchase_receipts pr ON pr.id=pri.receipt_id
LEFT JOIN purchases p ON p.id=pr.purchase_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_ledger (
  id,company_id,store_id,supplier_id,purchase_id,transaction_id,source_record_id,source_record_type,
  invoice_number,invoice_date,due_date,subtotal,tax,total,paid_amount,outstanding_amount,status,notes,created_by,created_at,updated_at,migrated_at
)
SELECT si.id,si.company_id,si.store_id,si.supplier_id,si.purchase_id,COALESCE(si.purchase_id,si.id),si.id,'SUPPLIER_INVOICE',
       si.invoice_number,si.invoice_date,si.due_date,si.subtotal,si.tax,si.total,
       NULLIF(to_jsonb(si)->>'paid_amount','')::numeric,
       NULLIF(to_jsonb(si)->>'outstanding_amount','')::numeric,
       si.status,si.notes,si.created_by,si.created_at,si.updated_at,NOW()
FROM supplier_invoices si
ON CONFLICT (id) DO NOTHING;

INSERT INTO purchase_ledger (
  id,company_id,store_id,supplier_id,transaction_id,source_record_id,source_record_type,
  payment_date,payment_method,reference_number,amount,status,notes,idempotency_key,created_by,created_at,allocation_data,migrated_at
)
SELECT sp.id,sp.company_id,sp.store_id,sp.supplier_id,sp.id,sp.id,'SUPPLIER_PAYMENT',
       sp.payment_date,sp.payment_method,sp.reference,sp.amount,sp.status,sp.notes,sp.idempotency_key,sp.created_by,sp.created_at,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object('invoiceId',a.invoice_id,'amount',a.amount) ORDER BY a.id)
         FROM supplier_payment_allocations a WHERE a.payment_id=sp.id
       ),'[]'::jsonb),NOW()
FROM supplier_payments sp
ON CONFLICT (id) DO NOTHING;

-- 3) Sales Order: order header and line rows in one generic table.
CREATE TABLE IF NOT EXISTS salesorder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  order_id UUID,
  transaction_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_record_id UUID,
  source_record_type VARCHAR(30) NOT NULL,
  external_reference VARCHAR(255),
  external_order_id VARCHAR(255),
  external_item_id VARCHAR(255),
  platform VARCHAR(40),
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),
  fulfilment_type VARCHAR(40),
  status VARCHAR(40),
  product_name VARCHAR(255),
  quantity NUMERIC(12,3),
  unit_price NUMERIC(12,2),
  subtotal NUMERIC(12,2),
  tax NUMERIC(12,2),
  delivery_fee NUMERIC(12,2),
  total NUMERIC(12,2),
  mapping_status VARCHAR(30),
  notes TEXT,
  delivery_address TEXT,
  customer_data JSONB,
  platform_data JSONB,
  currency VARCHAR(10),
  payment_method VARCHAR(50),
  payment_status VARCHAR(30),
  cancel_reason TEXT,
  inventory_reserved BOOLEAN,
  inventory_released BOOLEAN,
  public_tracking_token_hash VARCHAR(64),
  public_tracking_token_ciphertext TEXT,
  public_tracking_token_expires_at TIMESTAMPTZ,
  delivery_driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
  delivery_assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  delivery_assigned_at TIMESTAMPTZ,
  delivery_route_order INTEGER,
  delivery_status_note TEXT,
  out_for_delivery_at TIMESTAMPTZ,
  failed_delivery_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  preparing_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  migrated_at TIMESTAMPTZ,
  UNIQUE(source_record_type, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_salesorder_transaction ON salesorder(transaction_id);
CREATE INDEX IF NOT EXISTS idx_salesorder_company_status ON salesorder(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_salesorder_external ON salesorder(company_id,platform,external_order_id);
CREATE INDEX IF NOT EXISTS idx_salesorder_product ON salesorder(product_id);

INSERT INTO salesorder (
  id,company_id,store_id,customer_id,order_id,transaction_id,source_record_id,source_record_type,
  external_reference,external_order_id,platform,customer_name,customer_phone,customer_email,fulfilment_type,status,
  subtotal,tax,delivery_fee,total,notes,delivery_address,customer_data,platform_data,currency,payment_method,payment_status,cancel_reason,
  inventory_reserved,inventory_released,public_tracking_token_hash,public_tracking_token_ciphertext,public_tracking_token_expires_at,
  delivery_driver_id,delivery_assigned_by,delivery_assigned_at,delivery_route_order,delivery_status_note,out_for_delivery_at,
  failed_delivery_at,returned_at,accepted_at,preparing_at,ready_at,completed_at,cancelled_at,completed_by,created_at,updated_at,migrated_at
)
SELECT
  o.id,o.company_id,o.store_id,o.customer_id,o.id,o.id,o.id,'ORDER_HEADER',
  o.external_reference,o.external_order_id,o.platform,o.customer_name,o.customer_phone,o.customer_email,o.fulfilment_type,o.status,
  o.subtotal,o.tax,o.delivery_fee,o.total,o.notes,o.delivery_address,o.customer_data,o.platform_data,o.currency,o.payment_method,o.payment_status,o.cancel_reason,
  o.inventory_reserved,o.inventory_released,o.public_tracking_token_hash,o.public_tracking_token_ciphertext,o.public_tracking_token_expires_at,
  o.delivery_driver_id,o.delivery_assigned_by,o.delivery_assigned_at,o.delivery_route_order,o.delivery_status_note,o.out_for_delivery_at,
  o.failed_delivery_at,o.returned_at,o.accepted_at,o.preparing_at,o.ready_at,o.completed_at,o.cancelled_at,o.completed_by,o.created_at,o.updated_at,NOW()
FROM online_orders o
ON CONFLICT (id) DO NOTHING;

INSERT INTO salesorder (
  id,company_id,store_id,customer_id,product_id,order_id,transaction_id,source_record_id,source_record_type,
  external_reference,external_order_id,external_item_id,platform,status,product_name,quantity,unit_price,tax,total,mapping_status,platform_data,
  created_at,updated_at,migrated_at
)
SELECT
  oi.id,o.company_id,o.store_id,o.customer_id,oi.product_id,oi.order_id,oi.order_id,oi.id,'ORDER_LINE',
  o.external_reference,o.external_order_id,oi.external_item_id,o.platform,o.status,oi.product_name,oi.quantity,oi.unit_price,oi.tax,oi.total,oi.mapping_status,oi.platform_data,
  oi.created_at,o.updated_at,NOW()
FROM online_order_items oi JOIN online_orders o ON o.id=oi.order_id
ON CONFLICT (id) DO NOTHING;

-- 4) Repoint surviving technical/support references from online_orders to salesorder.
DO $$
DECLARE fk RECORD;
BEGIN
  IF to_regclass('public.online_orders') IS NOT NULL THEN
    FOR fk IN
      SELECT conrelid::regclass AS table_name, conname
      FROM pg_constraint
      WHERE contype='f' AND confrelid=to_regclass('public.online_orders')
        AND conrelid <> to_regclass('public.online_order_items')
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.table_name, fk.conname);
    END LOOP;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL THEN
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_salesorder_id_fkey;
    ALTER TABLE payments ADD CONSTRAINT payments_salesorder_id_fkey FOREIGN KEY (online_order_id) REFERENCES salesorder(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.online_order_events') IS NOT NULL THEN
    ALTER TABLE online_order_events DROP CONSTRAINT IF EXISTS online_order_events_salesorder_id_fkey;
    ALTER TABLE online_order_events ADD CONSTRAINT online_order_events_salesorder_id_fkey FOREIGN KEY (order_id) REFERENCES salesorder(id) ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.platform_api_logs') IS NOT NULL THEN
    ALTER TABLE platform_api_logs DROP CONSTRAINT IF EXISTS platform_api_logs_salesorder_id_fkey;
    ALTER TABLE platform_api_logs ADD CONSTRAINT platform_api_logs_salesorder_id_fkey FOREIGN KEY (order_id) REFERENCES salesorder(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.sale_ledger') IS NOT NULL THEN
    ALTER TABLE sale_ledger DROP CONSTRAINT IF EXISTS sale_ledger_salesorder_id_fkey;
    ALTER TABLE sale_ledger ADD CONSTRAINT sale_ledger_salesorder_id_fkey FOREIGN KEY (online_order_id) REFERENCES salesorder(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 5) Remove metadata/data models explicitly rejected in the review.
DROP TABLE IF EXISTS customer_loyalty_adjustments;
DROP TABLE IF EXISTS customer_loyalty_transactions;
DROP TABLE IF EXISTS customer_loyalty_balances;
DROP TABLE IF EXISTS gift_card_transactions;

-- 6) Retire absorbed physical purchase/order tables after data is preserved.
DROP TABLE IF EXISTS supplier_payment_allocations;
DROP TABLE IF EXISTS supplier_payments;
DROP TABLE IF EXISTS supplier_invoices;
DROP TABLE IF EXISTS purchase_receipt_items;
DROP TABLE IF EXISTS purchase_receipts;
DROP TABLE IF EXISTS purchase_items;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS online_order_items;
DROP TABLE IF EXISTS online_orders;

-- 7) Clean active Platform metadata rows for removed/absorbed object identities.
DO $$
DECLARE obj RECORD;
DECLARE owned UUID[];
BEGIN
  FOR obj IN
    SELECT id FROM platform_objects
    WHERE object_key = ANY(ARRAY[
      'till_session','cash_movement','purchase','purchase_line','purchase_receipt',
      'supplier_invoice','supplier_payment','supplier_payment_allocation',
      'inventory_movement','online_order','online_order_line',
      'appointment','appointment_booking_case',
      'loyalty_configuration','loyalty_account','loyalty_activity','loyalty_adjustment',
      'gift_card_activity'
    ]::text[])
  LOOP
    SELECT ARRAY[obj.id] || COALESCE(array_agg(id),'{}'::uuid[]) INTO owned
    FROM (
      SELECT id FROM platform_fields WHERE object_id=obj.id
      UNION ALL SELECT id FROM platform_relationships WHERE parent_object_id=obj.id OR child_object_id=obj.id
      UNION ALL SELECT id FROM platform_layouts WHERE object_id=obj.id
      UNION ALL SELECT id FROM platform_rules WHERE object_id=obj.id
      UNION ALL SELECT id FROM platform_reports WHERE object_id=obj.id
      UNION ALL SELECT id FROM platform_list_views WHERE object_id=obj.id
      UNION ALL SELECT id FROM platform_object_permissions WHERE object_id=obj.id
      UNION ALL SELECT id FROM platform_registered_actions WHERE object_id=obj.id
      UNION ALL SELECT id FROM platform_buttons WHERE object_id=obj.id
    ) ids;
    DELETE FROM package_metadata_ownership WHERE metadata_id=ANY(owned);
    DELETE FROM platform_relationships WHERE parent_object_id=obj.id OR child_object_id=obj.id;
    DELETE FROM platform_objects WHERE id=obj.id;
  END LOOP;
END $$;
