-- Phase 3B: move retail schema reconciliation out of runtime metadata bootstrapping.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_received NUMERIC(12,2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS line_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE CASCADE;

UPDATE cash_movements cm
   SET company_id=ts.company_id,
       store_id=ts.store_id
  FROM till_sessions ts
 WHERE ts.id=cm.till_session_id
   AND (cm.company_id IS NULL OR cm.store_id IS NULL);
