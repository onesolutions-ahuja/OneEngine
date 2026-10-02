-- OneEngine exact root-cause diagnostics.
-- Existing six-character codes remain valid. New seven-character codes add
-- one numeric discriminator when a subsystem/cause family needs finer detail.

ALTER TABLE oneengine_debug_events
  DROP CONSTRAINT IF EXISTS oneengine_debug_events_code_fkey;

ALTER TABLE oneengine_debug_codes
  ALTER COLUMN code TYPE VARCHAR(7);
ALTER TABLE oneengine_debug_events
  ALTER COLUMN code TYPE VARCHAR(7);
ALTER TABLE platform_action_jobs
  ALTER COLUMN last_error_code TYPE VARCHAR(7);
ALTER TABLE platform_workflow_runs
  ALTER COLUMN error_code TYPE VARCHAR(7);
ALTER TABLE platform_workflow_step_runs
  ALTER COLUMN error_code TYPE VARCHAR(7);
ALTER TABLE platform_workflow_compensation_runs
  ALTER COLUMN error_code TYPE VARCHAR(7);

ALTER TABLE oneengine_debug_codes
  DROP CONSTRAINT IF EXISTS oneengine_debug_code_format;
ALTER TABLE oneengine_debug_codes
  ADD CONSTRAINT oneengine_debug_code_format
  CHECK (code ~ '^OE[A-Z]{2}[0-9]{2,3}$');

ALTER TABLE oneengine_debug_events
  ADD CONSTRAINT oneengine_debug_events_code_fkey
  FOREIGN KEY (code) REFERENCES oneengine_debug_codes(code);

ALTER TABLE oneengine_debug_events
  ADD COLUMN IF NOT EXISTS root_cause_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS diagnostic_details JSONB;

INSERT INTO oneengine_debug_codes
(code,category,title,user_message,internal_description,severity,retryable,active,built_in,match_pattern,sort_order,subsystem_key,cause_key)
VALUES
('OENC101','Network','API base configuration mismatch','OneEngine is configured to use the wrong API service.','Frontend API base does not match the canonical production OneEngine API host.','CRITICAL',FALSE,TRUE,TRUE,'API_BASE_MISMATCH|configured API host',20,'N','C'),
('OENO101','Network','Stale server override','This device is configured to use an unavailable OneEngine server.','Persisted device/local server override points to a stale or incorrect API host.','ERROR',FALSE,TRUE,TRUE,'STALE_SERVER_OVERRIDE|server override',21,'N','O'),
('OENX101','Network','CORS request header blocked','OneEngine could not connect because the browser blocked an API request.','CORS preflight rejected a requested header.','ERROR',FALSE,TRUE,TRUE,'CORS_HEADER_BLOCKED|Access-Control-Allow-Headers',22,'N','X'),
('OENX102','Network','CORS origin blocked','OneEngine could not connect because this web origin is not allowed.','API host is reachable but CORS rejected the frontend Origin.','ERROR',FALSE,TRUE,TRUE,'CORS_ORIGIN_BLOCKED|CORS origin not allowed',23,'N','X'),
('OENX103','Network','CORS method blocked','OneEngine could not connect because the browser blocked this API method.','CORS preflight rejected the requested HTTP method.','ERROR',FALSE,TRUE,TRUE,'CORS_METHOD_BLOCKED',24,'N','X'),
('OENX104','Network','CORS preflight failed','OneEngine could not connect because the browser preflight check failed.','Host is reachable with a simple request while the preflighted request fails.','ERROR',FALSE,TRUE,TRUE,'CORS_PREFLIGHT_FAILED|preflight.*failed',25,'N','X'),
('OEND101','Network','API hostname could not be resolved','The OneEngine service address could not be resolved.','DNS/hostname resolution failed before HTTP.','CRITICAL',TRUE,TRUE,TRUE,'ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED',26,'N','D'),
('OENT101','Network','TLS certificate or handshake failed','A secure connection to OneEngine could not be established.','TLS/SSL certificate validation or handshake failed.','CRITICAL',FALSE,TRUE,TRUE,'CERT_|SSL_|TLS_|ERR_CERT',27,'N','T'),
('OENT102','Network','API request timed out','OneEngine did not respond in time.','Client timeout elapsed while waiting for the API.','ERROR',TRUE,TRUE,TRUE,'API_TIMEOUT|request timed out',28,'N','T'),
('OENR101','Network','Browser transport failure','OneEngine service could not be reached.','Browser could not establish transport and redacted the lower-level cause.','CRITICAL',TRUE,TRUE,TRUE,'BROWSER_TRANSPORT_UNREACHABLE',29,'N','R'),
('OENR102','Network','API connection refused','The OneEngine service refused the connection.','Target host resolved but refused the TCP connection.','CRITICAL',TRUE,TRUE,TRUE,'ECONNREFUSED|ERR_CONNECTION_REFUSED',30,'N','R'),
('OENH101','Network','API health endpoint unhealthy','OneEngine is reachable but is not healthy.','/api/health returned a non-success status.','ERROR',TRUE,TRUE,TRUE,'API_HEALTH_UNHEALTHY',31,'N','H'),
('OESB101','Server','Startup database migration failed','OneEngine could not complete platform startup.','Startup reached database initialization but a migration failed.','CRITICAL',FALSE,TRUE,TRUE,'STARTUP_MIGRATION_FAILED|migration .* failed',40,'S','B'),
('OESB102','Server','Package registry bootstrap failed','OneEngine could not complete package initialization.','Package catalogue/registry verification failed during startup.','CRITICAL',FALSE,TRUE,TRUE,'PACKAGE_REGISTRY_BOOTSTRAP_FAILED|package registry.*failed',41,'S','B'),
('OESB103','Server','Identity bootstrap failed','OneEngine could not complete identity initialization.','Identity/RBAC bootstrap failed during startup.','CRITICAL',FALSE,TRUE,TRUE,'IDENTITY_BOOTSTRAP_FAILED|identity bootstrap.*failed',42,'S','B'),
('OESB104','Server','Platform metadata bootstrap failed','OneEngine could not complete platform initialization.','Platform metadata/bootstrap initialization failed.','CRITICAL',FALSE,TRUE,TRUE,'PLATFORM_BOOTSTRAP_FAILED|platform bootstrap.*failed',43,'S','B'),
('OEDC101','Database','Database connection refused','OneEngine data services are unavailable.','Postgres/Neon endpoint refused or terminated the connection.','CRITICAL',TRUE,TRUE,TRUE,'ECONNREFUSED|connection refused|connection terminated',50,'D','C'),
('OEDC102','Database','Database authentication failed','OneEngine data services could not authenticate.','Database credentials/user authentication was rejected.','CRITICAL',FALSE,TRUE,TRUE,'password authentication failed|28P01',51,'D','C'),
('OEDP101','Database','Database pool exhausted','OneEngine data services are temporarily busy.','Postgres pool/provider connection slots are exhausted.','CRITICAL',TRUE,TRUE,TRUE,'too many clients|remaining connection slots|pool.*exhaust',52,'D','P'),
('OEDS101','Database','Database storage exhausted','OneEngine data storage capacity has been reached.','Database/provider storage or disk quota is exhausted.','CRITICAL',FALSE,TRUE,TRUE,'disk full|no space left|storage quota',53,'D','S'),
('OEDM101','Database','Database migration syntax failed','OneEngine could not complete a database migration.','Migration SQL failed with PostgreSQL syntax/parse error.','CRITICAL',FALSE,TRUE,TRUE,'syntax error at or near|42601',54,'D','M'),
('OEDM102','Database','Database migration constraint failed','OneEngine could not complete a database migration.','Migration failed while creating/altering a schema constraint.','CRITICAL',FALSE,TRUE,TRUE,'migration.*constraint|dependent objects',55,'D','M'),
('OEDT101','Database','Database deadlock','The data operation conflicted with another operation. Please retry.','PostgreSQL detected a deadlock.','WARNING',TRUE,TRUE,TRUE,'deadlock detected|40P01',56,'D','T'),
('OEDT102','Database','Database serialization conflict','The data operation conflicted with another update. Please retry.','PostgreSQL serialization failure requires retry.','WARNING',TRUE,TRUE,TRUE,'could not serialize|40001',57,'D','T'),
('OEDX101','Database','Unique constraint violation','A record with the same unique value already exists.','PostgreSQL unique constraint violation.','ERROR',FALSE,TRUE,TRUE,'duplicate key|23505',58,'D','X'),
('OEDX102','Database','Foreign key constraint violation','This record references data that is unavailable or still in use.','PostgreSQL foreign-key constraint violation.','ERROR',FALSE,TRUE,TRUE,'foreign key constraint|23503',59,'D','X'),
('OEDX103','Database','Required database value missing','A required value is missing.','PostgreSQL NOT NULL constraint violation.','ERROR',FALSE,TRUE,TRUE,'not-null constraint|23502',60,'D','X'),
('OEFL101','Frontend','Frontend chunk/module load failed','This page could not be loaded.','Deployed JavaScript chunk/module could not be fetched or evaluated.','ERROR',TRUE,TRUE,TRUE,'failed to fetch dynamically imported module|loading chunk|module script',70,'F','L'),
('OEFR101','Frontend','Frontend runtime exception','This screen could not be displayed.','Unhandled React/browser runtime exception.','ERROR',TRUE,TRUE,TRUE,'REACT_RUNTIME_ERROR|render.*exception',71,'F','R'),
('OEFC101','Frontend','Frontend configuration missing','This screen is not configured correctly.','Required frontend runtime/build configuration is absent or invalid.','ERROR',FALSE,TRUE,TRUE,'FRONTEND_CONFIG_MISSING|required frontend config',72,'F','C'),
('OEFC102','Frontend','Frontend API configuration stale','This frontend build is configured for an outdated OneEngine API.','Deployed frontend API base does not match the current production service.','CRITICAL',FALSE,TRUE,TRUE,'FRONTEND_API_CONFIG_STALE|stale API.*config',73,'F','C')
ON CONFLICT (code) DO UPDATE SET
 category=EXCLUDED.category,
 title=EXCLUDED.title,
 user_message=EXCLUDED.user_message,
 internal_description=EXCLUDED.internal_description,
 severity=EXCLUDED.severity,
 retryable=EXCLUDED.retryable,
 active=TRUE,
 built_in=TRUE,
 match_pattern=EXCLUDED.match_pattern,
 sort_order=EXCLUDED.sort_order,
 subsystem_key=EXCLUDED.subsystem_key,
 cause_key=EXCLUDED.cause_key,
 updated_at=NOW();
