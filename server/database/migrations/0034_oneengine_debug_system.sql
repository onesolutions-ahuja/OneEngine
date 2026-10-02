CREATE TABLE IF NOT EXISTS oneengine_debug_codes (
  code VARCHAR(6) PRIMARY KEY,
  category VARCHAR(80) NOT NULL,
  title VARCHAR(160) NOT NULL,
  user_message VARCHAR(500) NOT NULL,
  internal_description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'ERROR'
    CHECK (severity IN ('INFO','WARNING','ERROR','CRITICAL','FATAL')),
  retryable BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  built_in BOOLEAN NOT NULL DEFAULT FALSE,
  match_pattern TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT oneengine_debug_code_format CHECK (code ~ '^OE[A-Z][0-9]{2,3}$')
);

CREATE TABLE IF NOT EXISTS oneengine_debug_events (
  id BIGSERIAL PRIMARY KEY,
  reference VARCHAR(16) NOT NULL,
  code VARCHAR(6) NOT NULL REFERENCES oneengine_debug_codes(code),
  company_id UUID,
  user_id UUID,
  endpoint TEXT,
  http_method VARCHAR(12),
  http_status INTEGER,
  technical_code VARCHAR(160),
  technical_message TEXT,
  stack_trace TEXT,
  environment VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oneengine_debug_events_code_created
  ON oneengine_debug_events(code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oneengine_debug_events_reference
  ON oneengine_debug_events(reference);
CREATE INDEX IF NOT EXISTS idx_oneengine_debug_events_company_created
  ON oneengine_debug_events(company_id, created_at DESC);

INSERT INTO oneengine_debug_codes
(code,category,title,user_message,internal_description,severity,retryable,active,built_in,match_pattern,sort_order)
VALUES
('OES01','Server','Service starting','OneEngine is starting. Please try again shortly.','API process is alive but core startup is not complete.','WARNING',TRUE,TRUE,TRUE,NULL,10),
('OES02','Server','Service unavailable','OneEngine is temporarily unavailable.','Server-side service failure outside a more specific category.','CRITICAL',TRUE,TRUE,TRUE,NULL,20),
('OEN01','Network','Server not reachable','OneEngine could not be reached. Check your connection and try again.','Browser/device could not reach the API.','ERROR',TRUE,TRUE,TRUE,NULL,30),
('OEN02','Network','Request timeout','The request took too long. Please try again.','Request exceeded the configured client/server timeout.','ERROR',TRUE,TRUE,TRUE,'timeout|timed out',31),
('OED01','Database','Database unavailable','OneEngine data services are temporarily unavailable.','Database connection/query infrastructure is unavailable.','CRITICAL',TRUE,TRUE,TRUE,'ECONNREFUSED|connection terminated|connection refused|database.*unavailable|failed to connect|connect ETIMEDOUT|too many clients|remaining connection slots',40),
('OED02','Database','Database resource limit','OneEngine data services are temporarily unavailable.','Database provider quota, allowance, compute or resource limit was reached.','CRITICAL',FALSE,TRUE,TRUE,'quota|allowance|resource limit|usage limit|exhaust|compute.*suspend|project.*suspend|billing.*limit',41),
('OEA01','API','API unavailable','The requested OneEngine service is unavailable.','API dependency or route is unavailable.','ERROR',TRUE,TRUE,TRUE,NULL,50),
('OEA02','API','Unexpected API error','OneEngine could not complete this request.','Unhandled backend exception.','ERROR',FALSE,TRUE,TRUE,NULL,51),
('OEA03','API','Request rate limited','Too many requests. Please try again shortly.','API rate limit was reached.','WARNING',TRUE,TRUE,TRUE,'too many requests|rate limit',52),
('OEA04','API','Endpoint not found','The requested service could not be found.','API route does not exist.','ERROR',FALSE,TRUE,TRUE,NULL,53),
('OEF01','Frontend','Frontend runtime error','This screen could not be displayed.','Unhandled browser UI runtime exception.','ERROR',TRUE,TRUE,TRUE,NULL,60),
('OEF02','Frontend','Frontend module load error','This page could not be loaded.','Lazy JS module/chunk failed to load.','ERROR',TRUE,TRUE,TRUE,NULL,61),
('OER01','Permission','Permission denied','You do not have permission to perform this action.','RBAC/policy denied the request.','INFO',FALSE,TRUE,TRUE,NULL,70),
('OET01','Tenant','Company context unavailable','Your company context could not be resolved.','Authenticated company/tenant context is missing or invalid.','ERROR',FALSE,TRUE,TRUE,'company context|tenant context|acting company',71),
('OEU01','Session','Authentication required','Please sign in again to continue.','Authentication/session is missing or expired.','INFO',FALSE,TRUE,TRUE,'authentication required|session expired',72),
('OEW01','Workflow','Workflow failed','The automation could not be completed.','Workflow execution failed.','ERROR',FALSE,TRUE,TRUE,'workflow.*failed|automation.*failed',80),
('OEL01','Licence','Licence unavailable','This feature is not currently available.','Required package licence/entitlement is unavailable.','INFO',FALSE,TRUE,TRUE,'licen[cs]e|entitlement',81),
('OEP01','Package','Package operation failed','The app operation could not be completed.','OneStore/package install, update or lifecycle operation failed.','ERROR',FALSE,TRUE,TRUE,'package.*failed|install.*failed',82),
('OEI01','Integration','Integration failed','The connected service could not complete the request.','External connector/provider operation failed.','ERROR',TRUE,TRUE,TRUE,'connector.*failed|provider.*failed|integration.*failed',83),
('OEC01','Cache','Local data unavailable','Local data could not be loaded. Please refresh and try again.','Browser cache/IndexedDB persistence failed.','WARNING',TRUE,TRUE,TRUE,'indexeddb|cache.*failed',84)
ON CONFLICT (code) DO UPDATE SET
 category=EXCLUDED.category,
 title=EXCLUDED.title,
 user_message=EXCLUDED.user_message,
 internal_description=EXCLUDED.internal_description,
 severity=EXCLUDED.severity,
 retryable=EXCLUDED.retryable,
 built_in=TRUE,
 match_pattern=COALESCE(oneengine_debug_codes.match_pattern,EXCLUDED.match_pattern),
 updated_at=NOW();
