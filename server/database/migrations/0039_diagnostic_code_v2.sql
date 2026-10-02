-- OneEngine diagnostic code v2: OE + subsystem + cause + 2 digits.
-- Legacy 5-character codes remain stored for historical screenshots/events,
-- but all new built-in/runtime classifications use the 6-character format.

ALTER TABLE oneengine_debug_codes
  DROP CONSTRAINT IF EXISTS oneengine_debug_code_format;

ALTER TABLE oneengine_debug_codes
  ADD COLUMN IF NOT EXISTS subsystem_key CHAR(1),
  ADD COLUMN IF NOT EXISTS cause_key CHAR(1),
  ADD COLUMN IF NOT EXISTS legacy_code VARCHAR(6);

ALTER TABLE oneengine_debug_codes
  ADD CONSTRAINT oneengine_debug_code_format
  CHECK (code ~ '^OE[A-Z]{2}[0-9]{2}$' OR code ~ '^OE[A-Z][0-9]{2,3}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_oneengine_debug_codes_legacy_code
  ON oneengine_debug_codes(legacy_code)
  WHERE legacy_code IS NOT NULL;

INSERT INTO oneengine_debug_codes
(code,category,title,user_message,internal_description,severity,retryable,active,built_in,match_pattern,sort_order,subsystem_key,cause_key,legacy_code)
VALUES
('OESB01','Server','Service bootstrap in progress','OneEngine is starting. Please try again shortly.','API process is reachable but core startup/bootstrap has not completed.','WARNING',TRUE,TRUE,TRUE,'bootstrap|starting|initiali[sz]ing',10,'S','B','OES01'),
('OESS01','Server','Server service unavailable','OneEngine is temporarily unavailable.','Server-side runtime/service failure outside a more specific subsystem.','CRITICAL',TRUE,TRUE,TRUE,NULL,11,'S','S','OES02'),

('OENH01','Network','API health failed','OneEngine is temporarily unavailable.','The API responded but /api/health reported an unhealthy state without a more specific code.','ERROR',TRUE,TRUE,TRUE,NULL,20,'N','H','OEN01'),
('OENR01','Network','API host unreachable','OneEngine service could not be reached.','Browser could not establish a connection to the OneEngine API host/runtime.','CRITICAL',TRUE,TRUE,TRUE,NULL,21,'N','R','OEN02'),
('OEND01','Network','Device offline','This device appears to be offline.','Browser reports no network connectivity before the API can be contacted.','WARNING',TRUE,TRUE,TRUE,NULL,22,'N','D','OEN03'),
('OENT01','Network','Request timeout','OneEngine did not respond in time.','The API request exceeded the configured timeout.','ERROR',TRUE,TRUE,TRUE,'timeout|timed out|ETIMEDOUT',23,'N','T','OEN04'),

('OEDC01','Database','Database connection unavailable','OneEngine data services are temporarily unavailable.','Database connection/query infrastructure is unavailable.','CRITICAL',TRUE,TRUE,TRUE,'ECONNREFUSED|connection terminated|connection refused|database.*unavailable|failed to connect|too many clients|remaining connection slots',30,'D','C','OED01'),
('OEDQ01','Database','Database resource limit','OneEngine data services are temporarily unavailable.','Database quota, allowance, compute or resource limit was reached.','CRITICAL',FALSE,TRUE,TRUE,'quota|allowance|resource limit|usage limit|exhaust|compute.*suspend|project.*suspend|billing.*limit',31,'D','Q','OED02'),
('OEDX01','Database','Database query failed','OneEngine could not complete the data request.','Database query/constraint/transaction failed without a more specific database classification.','ERROR',FALSE,TRUE,TRUE,'SQLSTATE|constraint|duplicate key|deadlock|serialization failure',32,'D','X',NULL),

('OEAA01','API','API dependency unavailable','The requested OneEngine service is unavailable.','API dependency/upstream service is unavailable.','ERROR',TRUE,TRUE,TRUE,NULL,40,'A','A','OEA01'),
('OEAE01','API','Unexpected API exception','OneEngine could not complete this request.','Unhandled backend/API exception.','ERROR',FALSE,TRUE,TRUE,NULL,41,'A','E','OEA02'),
('OEAR01','API','API rate limited','Too many requests. Please try again shortly.','API rate limit was reached.','WARNING',TRUE,TRUE,TRUE,'too many requests|rate limit',42,'A','R','OEA03'),
('OEAF01','API','API endpoint not found','The requested service could not be found.','API route does not exist.','ERROR',FALSE,TRUE,TRUE,NULL,43,'A','F','OEA04'),

('OEFR01','Frontend','Frontend runtime error','This screen could not be displayed.','Unhandled browser/UI runtime exception.','ERROR',TRUE,TRUE,TRUE,NULL,50,'F','R','OEF01'),
('OEFL01','Frontend','Frontend module load error','This page could not be loaded.','Lazy JavaScript module/chunk failed to load.','ERROR',TRUE,TRUE,TRUE,'failed to fetch dynamically imported module|loading chunk|module script failed',51,'F','L','OEF02'),
('OEFC01','Frontend','Frontend configuration error','This screen is not configured correctly.','Frontend route/component/configuration is invalid or incomplete.','ERROR',FALSE,TRUE,TRUE,'frontend.*config|component.*config|route.*config',52,'F','C',NULL),

('OERP01','Permission','RBAC permission denied','You do not have permission to perform this action.','RBAC or permission policy denied the request.','INFO',FALSE,TRUE,TRUE,'permission denied|not authorised|not authorized|RBAC',60,'R','P','OER01'),
('OERS01','Permission','Security policy blocked','This action is blocked by security policy.','Identity/security policy denied an otherwise authenticated request.','WARNING',FALSE,TRUE,TRUE,'security policy|RESOURCE_BLOCKED|STEP_UP_REQUIRED',61,'R','S',NULL),

('OETC01','Tenant','Company context unavailable','Your company context could not be resolved.','Authenticated tenant/company context is missing or invalid.','ERROR',FALSE,TRUE,TRUE,'company context|tenant context|acting company',70,'T','C','OET01'),
('OETS01','Tenant','Store context unavailable','Your store context could not be resolved.','Required store context is missing, invalid, or not assigned.','ERROR',FALSE,TRUE,TRUE,'store context|selected store|store.*assigned',71,'T','S',NULL),

('OEUA01','Session','Authentication required','Please sign in again to continue.','Authentication is missing, invalid or expired.','INFO',FALSE,TRUE,TRUE,'authentication required|session expired|invalid token|jwt expired',80,'U','A','OEU01'),
('OEUM01','Session','MFA verification failed','Additional verification could not be completed.','MFA/passkey/TOTP verification failed.','WARNING',FALSE,TRUE,TRUE,'MFA|TOTP|passkey|verification failed',81,'U','M',NULL),

('OEWE01','Workflow','Workflow execution failed','The automation could not be completed.','Workflow runtime failed outside a more specific workflow cause.','ERROR',FALSE,TRUE,TRUE,'workflow.*failed|automation.*failed',90,'W','E','OEW01'),
('OEWV01','Workflow','Workflow validation failed','The automation configuration is invalid.','Workflow definition/resource/validation failed before execution.','ERROR',FALSE,TRUE,TRUE,'workflow.*validation|invalid workflow|resource.*unavailable|no executable actions',91,'W','V',NULL),
('OEWA01','Workflow','Workflow action failed','A workflow step could not be completed.','A registered workflow action returned a failure or threw an exception.','ERROR',FALSE,TRUE,TRUE,'action failed|workflow action|step.*failed',92,'W','A',NULL),
('OEWW01','Workflow','Workflow wait/resume failed','The automation could not resume.','WAIT/subflow/scheduled-path resume failed.','ERROR',TRUE,TRUE,TRUE,'resume.*workflow|scheduled path|WAIT.*failed|subflow.*failed',93,'W','W',NULL),

('OELE01','Licence','Licence unavailable or expired','This feature is not currently available.','Required package licence/entitlement is absent, inactive or expired.','INFO',FALSE,TRUE,TRUE,'licen[cs]e|entitlement|expired.*package',100,'L','E','OEL01'),

('OEPI01','Package','Package install failed','The app could not be installed.','OneStore/package installation failed.','ERROR',FALSE,TRUE,TRUE,'package.*install|install.*failed',110,'P','I','OEP01'),
('OEPU01','Package','Package update failed','The app could not be updated.','Package release/upgrade lifecycle failed.','ERROR',TRUE,TRUE,TRUE,'package.*upgrade|release.*upgrade|update.*failed',111,'P','U',NULL),
('OEPD01','Package','Package dependency missing','A required app dependency is unavailable.','Package dependency or manifest requirement is missing.','ERROR',FALSE,TRUE,TRUE,'dependency.*missing|required package|manifest.*missing',112,'P','D',NULL),

('OEIA01','Integration','Integration authentication failed','The connected service needs attention.','Connector/provider authentication or credential validation failed.','ERROR',FALSE,TRUE,TRUE,'oauth|authentication.*provider|invalid credential|token exchange|unauthorized provider',120,'I','A','OEI01'),
('OEIC01','Integration','Integration connection failed','The connected service could not be reached.','Connector/provider network or connection operation failed.','ERROR',TRUE,TRUE,TRUE,'connector.*failed|provider.*unavailable|integration.*connection',121,'I','C',NULL),
('OEIR01','Integration','Integration rate limited','The connected service is temporarily busy.','External provider rate limit/throttle response.','WARNING',TRUE,TRUE,TRUE,'provider.*rate limit|429.*provider|throttl',122,'I','R',NULL),
('OEIW01','Integration','Integration webhook failed','A connected-service event could not be processed.','Inbound/outbound webhook validation or processing failed.','ERROR',TRUE,TRUE,TRUE,'webhook.*failed|signature.*invalid',123,'I','W',NULL),

('OECI01','Cache','IndexedDB/local cache failed','Local data could not be loaded. Please refresh and try again.','IndexedDB/local persistence operation failed.','WARNING',TRUE,TRUE,TRUE,'indexeddb|cache.*failed|local storage.*failed',130,'C','I','OEC01'),
('OECS01','Cache','Offline sync failed','Offline changes could not be synchronised.','Offline queue/synchronisation failed.','ERROR',TRUE,TRUE,TRUE,'offline.*sync|queue.*sync|sync.*failed',131,'C','S',NULL),

('OEXU01','Unknown','Unclassified platform error','OneEngine could not complete this request.','No registered diagnostic rule matched the failure. This code must not be used when a more specific classification is available.','ERROR',FALSE,TRUE,TRUE,NULL,999,'X','U',NULL)
ON CONFLICT (code) DO UPDATE SET
 category=EXCLUDED.category,title=EXCLUDED.title,user_message=EXCLUDED.user_message,
 internal_description=EXCLUDED.internal_description,severity=EXCLUDED.severity,
 retryable=EXCLUDED.retryable,active=TRUE,built_in=TRUE,
 match_pattern=EXCLUDED.match_pattern,sort_order=EXCLUDED.sort_order,
 subsystem_key=EXCLUDED.subsystem_key,cause_key=EXCLUDED.cause_key,
 legacy_code=COALESCE(oneengine_debug_codes.legacy_code,EXCLUDED.legacy_code),updated_at=NOW();

UPDATE oneengine_debug_codes
SET active=FALSE, updated_at=NOW()
WHERE code ~ '^OE[A-Z][0-9]{2,3}$'
  AND code IN ('OES01','OES02','OEN01','OEN02','OEN03','OEN04','OED01','OED02','OEA01','OEA02','OEA03','OEA04','OEF01','OEF02','OER01','OET01','OEU01','OEW01','OEL01','OEP01','OEI01','OEC01');
