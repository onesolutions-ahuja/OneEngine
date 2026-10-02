INSERT INTO oneengine_debug_codes
(code,category,title,user_message,internal_description,severity,retryable,active,built_in,match_pattern,sort_order)
VALUES
('OEN01','Network','API health failed','OneEngine is temporarily unavailable.','The API responded but /api/health reported an unhealthy platform state that did not map to a more specific OE code.','ERROR',TRUE,TRUE,TRUE,NULL,30),
('OEN02','Network','API host unreachable','OneEngine service could not be reached.','Browser could not establish a connection to the OneEngine API/Render host.','CRITICAL',TRUE,TRUE,TRUE,NULL,31),
('OEN03','Network','Device offline','This device appears to be offline.','Browser reports no network connectivity before the API can be contacted.','WARNING',TRUE,TRUE,TRUE,NULL,32),
('OEN04','Network','Request timeout','OneEngine did not respond in time.','The API/Render request exceeded the configured timeout.','ERROR',TRUE,TRUE,TRUE,'timeout|timed out',33)
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
 updated_at=NOW();
