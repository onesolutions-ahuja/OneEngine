import { randomBytes } from "node:crypto";

export const BUILTIN_DEBUG_CODES = Object.freeze([
  { code:"OESB01", legacyCode:"OES01", subsystem:"S", cause:"B", category:"Server", title:"Service bootstrap in progress", userMessage:"OneEngine is starting. Please try again shortly.", internalDescription:"API process is reachable but core startup/bootstrap has not completed.", severity:"WARNING", retryable:true, matchPattern:"bootstrap|starting|initiali[sz]ing" },
  { code:"OESS01", legacyCode:"OES02", subsystem:"S", cause:"S", category:"Server", title:"Server service unavailable", userMessage:"OneEngine is temporarily unavailable.", internalDescription:"Server-side runtime/service failure outside a more specific subsystem.", severity:"CRITICAL", retryable:true, matchPattern:"" },

  { code:"OENH01", legacyCode:"OEN01", subsystem:"N", cause:"H", category:"Network", title:"API health failed", userMessage:"OneEngine is temporarily unavailable.", internalDescription:"API responded but /api/health reported an unhealthy platform state without a more specific code.", severity:"ERROR", retryable:true, matchPattern:"" },
  { code:"OENR01", legacyCode:"OEN02", subsystem:"N", cause:"R", category:"Network", title:"API host unreachable", userMessage:"OneEngine service could not be reached.", internalDescription:"Browser could not establish a connection to the OneEngine API host/runtime.", severity:"CRITICAL", retryable:true, matchPattern:"" },
  { code:"OEND01", legacyCode:"OEN03", subsystem:"N", cause:"D", category:"Network", title:"Device offline", userMessage:"This device appears to be offline.", internalDescription:"Browser reports no network connectivity before the API can be contacted.", severity:"WARNING", retryable:true, matchPattern:"" },
  { code:"OENT01", legacyCode:"OEN04", subsystem:"N", cause:"T", category:"Network", title:"Request timeout", userMessage:"OneEngine did not respond in time.", internalDescription:"API request exceeded the configured timeout.", severity:"ERROR", retryable:true, matchPattern:"timeout|timed out|ETIMEDOUT" },

  { code:"OEDC01", legacyCode:"OED01", subsystem:"D", cause:"C", category:"Database", title:"Database connection unavailable", userMessage:"OneEngine data services are temporarily unavailable.", internalDescription:"Database connection/query infrastructure is unavailable.", severity:"CRITICAL", retryable:true, matchPattern:"ECONNREFUSED|connection terminated|connection refused|database.*unavailable|failed to connect|too many clients|remaining connection slots" },
  { code:"OEDQ01", legacyCode:"OED02", subsystem:"D", cause:"Q", category:"Database", title:"Database resource limit", userMessage:"OneEngine data services are temporarily unavailable.", internalDescription:"Database quota, allowance, compute or resource limit was reached.", severity:"CRITICAL", retryable:false, matchPattern:"quota|allowance|resource limit|usage limit|exhaust|compute.*suspend|project.*suspend|billing.*limit" },
  { code:"OEDX01", subsystem:"D", cause:"X", category:"Database", title:"Database query failed", userMessage:"OneEngine could not complete the data request.", internalDescription:"Database query/constraint/transaction failed without a more specific database classification.", severity:"ERROR", retryable:false, matchPattern:"SQLSTATE|constraint|duplicate key|deadlock|serialization failure" },

  { code:"OEAA01", legacyCode:"OEA01", subsystem:"A", cause:"A", category:"API", title:"API dependency unavailable", userMessage:"The requested OneEngine service is unavailable.", internalDescription:"API dependency/upstream service is unavailable.", severity:"ERROR", retryable:true, matchPattern:"" },
  { code:"OEAE01", legacyCode:"OEA02", subsystem:"A", cause:"E", category:"API", title:"Unexpected API exception", userMessage:"OneEngine could not complete this request.", internalDescription:"Unhandled backend/API exception.", severity:"ERROR", retryable:false, matchPattern:"" },
  { code:"OEAR01", legacyCode:"OEA03", subsystem:"A", cause:"R", category:"API", title:"API rate limited", userMessage:"Too many requests. Please try again shortly.", internalDescription:"API rate limit was reached.", severity:"WARNING", retryable:true, matchPattern:"too many requests|rate limit" },
  { code:"OEAF01", legacyCode:"OEA04", subsystem:"A", cause:"F", category:"API", title:"API endpoint not found", userMessage:"The requested service could not be found.", internalDescription:"API route does not exist.", severity:"ERROR", retryable:false, matchPattern:"" },

  { code:"OEFR01", legacyCode:"OEF01", subsystem:"F", cause:"R", category:"Frontend", title:"Frontend runtime error", userMessage:"This screen could not be displayed.", internalDescription:"Unhandled browser/UI runtime exception.", severity:"ERROR", retryable:true, matchPattern:"" },
  { code:"OEFL01", legacyCode:"OEF02", subsystem:"F", cause:"L", category:"Frontend", title:"Frontend module load error", userMessage:"This page could not be loaded.", internalDescription:"Lazy JavaScript module/chunk failed to load.", severity:"ERROR", retryable:true, matchPattern:"failed to fetch dynamically imported module|loading chunk|module script failed" },
  { code:"OEFC01", subsystem:"F", cause:"C", category:"Frontend", title:"Frontend configuration error", userMessage:"This screen is not configured correctly.", internalDescription:"Frontend route/component/configuration is invalid or incomplete.", severity:"ERROR", retryable:false, matchPattern:"frontend.*config|component.*config|route.*config" },

  { code:"OERP01", legacyCode:"OER01", subsystem:"R", cause:"P", category:"Permission", title:"RBAC permission denied", userMessage:"You do not have permission to perform this action.", internalDescription:"RBAC or permission policy denied the request.", severity:"INFO", retryable:false, matchPattern:"permission denied|not authorised|not authorized|RBAC" },
  { code:"OERS01", subsystem:"R", cause:"S", category:"Permission", title:"Security policy blocked", userMessage:"This action is blocked by security policy.", internalDescription:"Identity/security policy denied an otherwise authenticated request.", severity:"WARNING", retryable:false, matchPattern:"security policy|RESOURCE_BLOCKED|STEP_UP_REQUIRED" },

  { code:"OETC01", legacyCode:"OET01", subsystem:"T", cause:"C", category:"Tenant", title:"Company context unavailable", userMessage:"Your company context could not be resolved.", internalDescription:"Authenticated tenant/company context is missing or invalid.", severity:"ERROR", retryable:false, matchPattern:"company context|tenant context|acting company" },
  { code:"OETS01", subsystem:"T", cause:"S", category:"Tenant", title:"Store context unavailable", userMessage:"Your store context could not be resolved.", internalDescription:"Required store context is missing, invalid, or not assigned.", severity:"ERROR", retryable:false, matchPattern:"store context|selected store|store.*assigned" },

  { code:"OEUA01", legacyCode:"OEU01", subsystem:"U", cause:"A", category:"Session", title:"Authentication required", userMessage:"Please sign in again to continue.", internalDescription:"Authentication is missing, invalid or expired.", severity:"INFO", retryable:false, matchPattern:"authentication required|session expired|invalid token|jwt expired" },
  { code:"OEUM01", subsystem:"U", cause:"M", category:"Session", title:"MFA verification failed", userMessage:"Additional verification could not be completed.", internalDescription:"MFA/passkey/TOTP verification failed.", severity:"WARNING", retryable:false, matchPattern:"MFA|TOTP|passkey|verification failed" },

  { code:"OEWE01", legacyCode:"OEW01", subsystem:"W", cause:"E", category:"Workflow", title:"Workflow execution failed", userMessage:"The automation could not be completed.", internalDescription:"Workflow runtime failed outside a more specific workflow cause.", severity:"ERROR", retryable:false, matchPattern:"workflow.*failed|automation.*failed" },
  { code:"OEWV01", subsystem:"W", cause:"V", category:"Workflow", title:"Workflow validation failed", userMessage:"The automation configuration is invalid.", internalDescription:"Workflow definition/resource/validation failed before execution.", severity:"ERROR", retryable:false, matchPattern:"workflow.*validation|invalid workflow|resource.*unavailable|no executable actions" },
  { code:"OEWA01", subsystem:"W", cause:"A", category:"Workflow", title:"Workflow action failed", userMessage:"A workflow step could not be completed.", internalDescription:"A registered workflow action returned a failure or threw an exception.", severity:"ERROR", retryable:false, matchPattern:"action failed|workflow action|step.*failed" },
  { code:"OEWW01", subsystem:"W", cause:"W", category:"Workflow", title:"Workflow wait/resume failed", userMessage:"The automation could not resume.", internalDescription:"WAIT/subflow/scheduled-path resume failed.", severity:"ERROR", retryable:true, matchPattern:"resume.*workflow|scheduled path|WAIT.*failed|subflow.*failed" },

  { code:"OELE01", legacyCode:"OEL01", subsystem:"L", cause:"E", category:"Licence", title:"Licence unavailable or expired", userMessage:"This feature is not currently available.", internalDescription:"Required package licence/entitlement is absent, inactive or expired.", severity:"INFO", retryable:false, matchPattern:"licen[cs]e|entitlement|expired.*package" },

  { code:"OEPI01", legacyCode:"OEP01", subsystem:"P", cause:"I", category:"Package", title:"Package install failed", userMessage:"The app could not be installed.", internalDescription:"OneStore/package installation failed.", severity:"ERROR", retryable:false, matchPattern:"package.*install|install.*failed" },
  { code:"OEPU01", subsystem:"P", cause:"U", category:"Package", title:"Package update failed", userMessage:"The app could not be updated.", internalDescription:"Package release/upgrade lifecycle failed.", severity:"ERROR", retryable:true, matchPattern:"package.*upgrade|release.*upgrade|update.*failed" },
  { code:"OEPD01", subsystem:"P", cause:"D", category:"Package", title:"Package dependency missing", userMessage:"A required app dependency is unavailable.", internalDescription:"Package dependency or manifest requirement is missing.", severity:"ERROR", retryable:false, matchPattern:"dependency.*missing|required package|manifest.*missing" },

  { code:"OEIA01", legacyCode:"OEI01", subsystem:"I", cause:"A", category:"Integration", title:"Integration authentication failed", userMessage:"The connected service needs attention.", internalDescription:"Connector/provider authentication or credential validation failed.", severity:"ERROR", retryable:false, matchPattern:"oauth|authentication.*provider|invalid credential|token exchange|unauthorized provider" },
  { code:"OEIC01", subsystem:"I", cause:"C", category:"Integration", title:"Integration connection failed", userMessage:"The connected service could not be reached.", internalDescription:"Connector/provider network or connection operation failed.", severity:"ERROR", retryable:true, matchPattern:"connector.*failed|provider.*unavailable|integration.*connection" },
  { code:"OEIC02", subsystem:"I", cause:"C", category:"Integration", title:"Integration provider timeout", userMessage:"The connected service did not respond in time.", internalDescription:"External integration/provider request timed out before the OneEngine client timeout.", severity:"ERROR", retryable:true, matchPattern:"PROVIDER_TIMEOUT|provider request timed out" },
  { code:"OEIR01", subsystem:"I", cause:"R", category:"Integration", title:"Integration rate limited", userMessage:"The connected service is temporarily busy.", internalDescription:"External provider rate limit/throttle response.", severity:"WARNING", retryable:true, matchPattern:"provider.*rate limit|429.*provider|throttl" },
  { code:"OEIW01", subsystem:"I", cause:"W", category:"Integration", title:"Integration webhook failed", userMessage:"A connected-service event could not be processed.", internalDescription:"Inbound/outbound webhook validation or processing failed.", severity:"ERROR", retryable:true, matchPattern:"webhook.*failed|signature.*invalid" },

  { code:"OECI01", legacyCode:"OEC01", subsystem:"C", cause:"I", category:"Cache", title:"IndexedDB/local cache failed", userMessage:"Local data could not be loaded. Please refresh and try again.", internalDescription:"IndexedDB/local persistence operation failed.", severity:"WARNING", retryable:true, matchPattern:"indexeddb|cache.*failed|local storage.*failed" },
  { code:"OECS01", subsystem:"C", cause:"S", category:"Cache", title:"Offline sync failed", userMessage:"Offline changes could not be synchronised.", internalDescription:"Offline queue/synchronisation failed.", severity:"ERROR", retryable:true, matchPattern:"offline.*sync|queue.*sync|sync.*failed" },

  // Authentication / account
  { code:"OEUF01", subsystem:"U", cause:"F", category:"Authentication", title:"User not found", userMessage:"Invalid username or password.", internalDescription:"No matching login identity exists. User-facing text intentionally does not reveal account existence.", severity:"INFO", retryable:false, matchPattern:"USER_NOT_FOUND" },
  { code:"OEUP01", subsystem:"U", cause:"P", category:"Authentication", title:"Incorrect password", userMessage:"Invalid username or password.", internalDescription:"Password verification failed for a known account.", severity:"INFO", retryable:false, matchPattern:"INVALID_CREDENTIALS|INVALID_PASSWORD" },
  { code:"OEUL01", subsystem:"U", cause:"L", category:"Authentication", title:"Account locked", userMessage:"User account is locked.", internalDescription:"Account lockout is active after failed login attempts or an administrative lock.", severity:"WARNING", retryable:false, matchPattern:"ACCOUNT_LOCKED" },
  { code:"OEUD01", subsystem:"U", cause:"D", category:"Authentication", title:"Account disabled", userMessage:"User account is disabled.", internalDescription:"The user record is inactive/disabled.", severity:"INFO", retryable:false, matchPattern:"USER_DISABLED|account is disabled" },
  { code:"OEUE01", subsystem:"U", cause:"E", category:"Authentication", title:"Password expired", userMessage:"Your password has expired and must be changed.", internalDescription:"Password age exceeded the configured password-expiry policy.", severity:"INFO", retryable:false, matchPattern:"PASSWORD_EXPIRED" },
  { code:"OEUC01", subsystem:"U", cause:"C", category:"Authentication", title:"Password change required", userMessage:"You must change your password before continuing.", internalDescription:"Account is flagged to change password at next sign-in.", severity:"INFO", retryable:false, matchPattern:"MUST_CHANGE_PASSWORD|PASSWORD_CHANGE_REQUIRED" },
  { code:"OEUH01", subsystem:"U", cause:"H", category:"Authentication", title:"Login hours restricted", userMessage:"Login is not permitted at this time.", internalDescription:"Configured login-hours policy blocks this login.", severity:"INFO", retryable:false, matchPattern:"LOGIN_HOURS_RESTRICTED" },
  { code:"OEUI01", subsystem:"U", cause:"I", category:"Authentication", title:"Login IP restricted", userMessage:"Login from this network is not permitted.", internalDescription:"Configured IP restriction blocks this login or session.", severity:"INFO", retryable:false, matchPattern:"LOGIN_IP_RESTRICTED|LOGIN_IP_POLICY_EMPTY|SESSION_IP_CHANGED" },
  { code:"OEUW01", subsystem:"U", cause:"W", category:"Authentication", title:"Device activation required", userMessage:"This device must be verified before continuing.", internalDescription:"Identity policy requires device activation or trusted-device verification.", severity:"INFO", retryable:false, matchPattern:"DEVICE_ACTIVATION|DEVICE_NOT_TRUSTED|TRUSTED_DEVICE" },
  { code:"OEUS01", subsystem:"U", cause:"S", category:"Session", title:"Session invalid or expired", userMessage:"Please sign in again to continue.", internalDescription:"Session expired, was revoked, timed out, or changed security context.", severity:"INFO", retryable:false, matchPattern:"SESSION_REVOKED|SESSION_EXPIRED|SESSION_INACTIVITY_TIMEOUT|SESSION_DOMAIN_CHANGED" },
  { code:"OEUG01", subsystem:"U", cause:"G", category:"SSO", title:"SSO unavailable", userMessage:"Single sign-on is not available for this account.", internalDescription:"SSO licence, provider configuration, account link or protocol is unavailable.", severity:"INFO", retryable:false, matchPattern:"GOOGLE_SSO_REQUIRED|SSO_NOT_CONNECTED|provider_not_available|provider_not_configured|account_not_linked" },
  { code:"OEUK01", subsystem:"U", cause:"K", category:"Passkey", title:"Passkey verification failed", userMessage:"Passkey verification could not be completed.", internalDescription:"WebAuthn/passkey credential verification or challenge validation failed.", severity:"WARNING", retryable:false, matchPattern:"passkey|webauthn|credential.*verification" },
  { code:"OEUV01", subsystem:"U", cause:"V", category:"Authentication", title:"Login input invalid", userMessage:"Enter the required sign-in details.", internalDescription:"Required authentication input is missing or invalid before credential verification.", severity:"INFO", retryable:false, matchPattern:"LOGIN_INPUT_REQUIRED" },
  { code:"OEUP02", subsystem:"U", cause:"P", category:"Authentication", title:"Incorrect PIN", userMessage:"The PIN is incorrect.", internalDescription:"PIN verification failed.", severity:"INFO", retryable:false, matchPattern:"INVALID_PIN" },
  { code:"OEUP03", subsystem:"U", cause:"P", category:"Authentication", title:"PIN not configured", userMessage:"No PIN is configured for this user.", internalDescription:"PIN unlock was attempted before a PIN was configured.", severity:"INFO", retryable:false, matchPattern:"PIN_NOT_SET" },

  // Database / Neon
  { code:"OEDP01", subsystem:"D", cause:"P", category:"Database", title:"Database pool exhausted", userMessage:"OneEngine data services are temporarily busy.", internalDescription:"Postgres connection pool/client slots are exhausted.", severity:"CRITICAL", retryable:true, matchPattern:"too many clients|remaining connection slots|pool.*exhaust|connection pool" },
  { code:"OEDS01", subsystem:"D", cause:"S", category:"Database", title:"Database storage capacity reached", userMessage:"OneEngine data services are temporarily unavailable.", internalDescription:"Database/storage capacity or disk quota has been reached.", severity:"CRITICAL", retryable:false, matchPattern:"disk full|no space left|storage.*limit|database.*size.*limit|storage quota" },
  { code:"OEDM01", subsystem:"D", cause:"M", category:"Database", title:"Database migration failed", userMessage:"OneEngine could not complete platform startup.", internalDescription:"A schema/database migration failed.", severity:"CRITICAL", retryable:false, matchPattern:"migration .* failed|schema_migrations|DDL" },
  { code:"OEDT01", subsystem:"D", cause:"T", category:"Database", title:"Database transaction conflict", userMessage:"The data operation conflicted with another update. Please retry.", internalDescription:"Deadlock, serialization failure, lock timeout or transaction conflict.", severity:"WARNING", retryable:true, matchPattern:"deadlock|serialization failure|lock timeout|could not serialize" },

  // Workflow
  { code:"OEWR01", subsystem:"W", cause:"R", category:"Workflow", title:"Workflow resource missing", userMessage:"The automation is missing a required resource.", internalDescription:"A referenced workflow resource, object, record, variable or version is unavailable.", severity:"ERROR", retryable:false, matchPattern:"resource.*unavailable|resource.*missing|record.*no longer exists|workflow version.*missing" },
  { code:"OEWF01", subsystem:"W", cause:"F", category:"Workflow", title:"Workflow formula failed", userMessage:"The automation could not evaluate a formula.", internalDescription:"Formula expression evaluation failed.", severity:"ERROR", retryable:false, matchPattern:"formula.*failed|formula.*invalid|evaluate.*formula" },
  { code:"OEWC01", subsystem:"W", cause:"C", category:"Workflow", title:"Workflow condition failed", userMessage:"The automation could not evaluate a condition.", internalDescription:"Condition/branch evaluation failed.", severity:"ERROR", retryable:false, matchPattern:"condition.*failed|evaluate.*condition" },
  { code:"OEWS01", subsystem:"W", cause:"S", category:"Workflow", title:"Subflow failed", userMessage:"A subflow could not be completed.", internalDescription:"Child/subflow execution failed.", severity:"ERROR", retryable:false, matchPattern:"subflow.*failed|child run.*failed" },
  { code:"OEWT01", subsystem:"W", cause:"T", category:"Workflow", title:"Workflow timeout", userMessage:"The automation took too long to complete.", internalDescription:"Workflow/action execution timed out.", severity:"ERROR", retryable:true, matchPattern:"workflow.*timeout|action.*timeout" },
  { code:"OEWJ01", subsystem:"W", cause:"J", category:"Workflow", title:"Workflow background job failed", userMessage:"The automation could not complete in the background.", internalDescription:"Scheduled/event workflow background job failed or exhausted retries.", severity:"ERROR", retryable:true, matchPattern:"platform job.*failed|scheduled workflow.*failed|job.*attempt" },
  { code:"OEWU01", subsystem:"W", cause:"U", category:"Workflow", title:"Workflow execution user unavailable", userMessage:"The automation cannot run with its configured user.", internalDescription:"Workflow actor is missing, inactive or no longer has a valid RBAC role.", severity:"ERROR", retryable:false, matchPattern:"workflow automation actor|no active RBAC execution user" },
  { code:"OEWP01", subsystem:"W", cause:"P", category:"Workflow", title:"Workflow permission denied", userMessage:"The automation does not have permission to complete this action.", internalDescription:"Workflow execution failed an RBAC/permission check.", severity:"ERROR", retryable:false, matchPattern:"workflow.*permission|automation.*permission" },
  { code:"OEWL01", subsystem:"W", cause:"L", category:"Workflow", title:"Workflow licence unavailable", userMessage:"The automation requires a feature that is not currently licensed.", internalDescription:"Workflow execution failed an entitlement/licence check.", severity:"INFO", retryable:false, matchPattern:"workflow.*licen[cs]e|workflow.*entitlement" },
  { code:"OEWI01", subsystem:"W", cause:"I", category:"Workflow", title:"Workflow integration action failed", userMessage:"The automation could not complete a connected-service action.", internalDescription:"Workflow connector/integration action failed.", severity:"ERROR", retryable:true, matchPattern:"workflow.*integration|connector workflow action" },
  { code:"OEWH01", subsystem:"W", cause:"H", category:"Workflow", title:"Workflow HTTP/webhook action failed", userMessage:"The automation could not reach an external endpoint.", internalDescription:"Workflow HTTP_REQUEST/WEBHOOK action failed.", severity:"ERROR", retryable:true, matchPattern:"HTTP_REQUEST|CALL_WEBHOOK|webhook action" },
  { code:"OEWX01", subsystem:"W", cause:"X", category:"Workflow", title:"Workflow rollback failed", userMessage:"The automation failed and could not fully roll back.", internalDescription:"Workflow compensation/rollback encountered one or more failures.", severity:"CRITICAL", retryable:false, matchPattern:"compensation.*failed|rollback.*failed" },

  // Package/licensing
  { code:"OEPT01", subsystem:"P", cause:"T", category:"Package", title:"Trial expired", userMessage:"The free trial for this app has expired.", internalDescription:"Promotional/trial entitlement has expired.", severity:"INFO", retryable:false, matchPattern:"trial.*expired" },
  { code:"OEPE01", subsystem:"P", cause:"E", category:"Package", title:"Package entitlement unavailable", userMessage:"This app is not currently licensed.", internalDescription:"Package entitlement is absent, inactive, expired or suspended.", severity:"INFO", retryable:false, matchPattern:"NOT_LICENSED|NOT_ENTITLED|entitlement.*inactive|suspended_by_entitlement" },
  { code:"OEPM01", subsystem:"P", cause:"M", category:"Package", title:"Package manifest invalid", userMessage:"This app package could not be verified.", internalDescription:"Trusted package manifest/signature/catalogue verification failed.", severity:"ERROR", retryable:false, matchPattern:"manifest.*invalid|trusted package|catalogue.*invalid" },

  // Integration
  { code:"OEIT01", subsystem:"I", cause:"T", category:"Integration", title:"Integration token refresh failed", userMessage:"The connected service needs to be reconnected.", internalDescription:"OAuth access token expired and refresh failed or is unavailable.", severity:"ERROR", retryable:false, matchPattern:"token refresh|refresh token|token.*expired" },
  { code:"OEIP01", subsystem:"I", cause:"P", category:"Integration", title:"Provider rejected request", userMessage:"The connected service rejected the request.", internalDescription:"External provider returned a non-success API response.", severity:"ERROR", retryable:false, matchPattern:"provider.*40[0134]|provider rejected|remote.*rejected" },
  { code:"OEIM01", subsystem:"I", cause:"M", category:"Integration", title:"Integration mapping invalid", userMessage:"The connected-service mapping is incomplete or invalid.", internalDescription:"Field/data mapping validation failed.", severity:"ERROR", retryable:false, matchPattern:"mapping.*invalid|required mapping|field mapping" },
  { code:"OEIX01", subsystem:"I", cause:"X", category:"Integration", title:"Integration sync conflict", userMessage:"The connected-service data could not be reconciled.", internalDescription:"Remote/local sync or reconciliation conflict.", severity:"ERROR", retryable:false, matchPattern:"sync conflict|reconciliation conflict|record mismatch" },

  // Payment/hardware
  { code:"OEMD01", subsystem:"M", cause:"D", category:"Payment", title:"Payment declined", userMessage:"The payment was declined.", internalDescription:"Payment provider/terminal explicitly declined the payment.", severity:"INFO", retryable:false, matchPattern:"payment.*declined|DECLINED" },
  { code:"OEMT01", subsystem:"M", cause:"T", category:"Payment", title:"Payment timeout", userMessage:"The payment terminal did not respond in time.", internalDescription:"Payment provider or terminal request timed out.", severity:"ERROR", retryable:true, matchPattern:"payment.*timeout|terminal.*timeout" },
  { code:"OEMC01", subsystem:"M", cause:"C", category:"Payment", title:"Payment configuration invalid", userMessage:"The payment method is not configured correctly.", internalDescription:"Payment tender/terminal/provider configuration is missing or invalid.", severity:"ERROR", retryable:false, matchPattern:"payment.*not configured|terminal.*not configured|invalid payment line|Payments total" },
  { code:"OEMR01", subsystem:"M", cause:"R", category:"Payment", title:"Refund failed", userMessage:"The refund could not be completed.", internalDescription:"Payment/provider refund operation failed.", severity:"ERROR", retryable:false, matchPattern:"refund.*failed|refund.*rejected" },
  { code:"OEHP01", subsystem:"H", cause:"P", category:"Hardware", title:"Printer unavailable", userMessage:"The printer is unavailable.", internalDescription:"Receipt/kitchen printer is offline, disconnected or not configured.", severity:"WARNING", retryable:true, matchPattern:"printer.*offline|printer.*not configured|print.*failed" },
  { code:"OEHT01", subsystem:"H", cause:"T", category:"Hardware", title:"Card terminal unavailable", userMessage:"The card terminal is unavailable.", internalDescription:"Assigned payment terminal is disconnected/offline/unavailable.", severity:"ERROR", retryable:true, matchPattern:"terminal.*offline|terminal.*unavailable|terminal.*disconnected" },
  { code:"OEHS01", subsystem:"H", cause:"S", category:"Hardware", title:"Scanner unavailable", userMessage:"The scanner is unavailable.", internalDescription:"Barcode scanner is disconnected or unavailable.", severity:"WARNING", retryable:true, matchPattern:"scanner.*disconnected|scanner.*unavailable" },
  { code:"OEHD01", subsystem:"H", cause:"D", category:"Hardware", title:"Cash drawer failed", userMessage:"The cash drawer could not be opened.", internalDescription:"Cash-drawer connector/action failed.", severity:"WARNING", retryable:true, matchPattern:"cash drawer.*failed|drawer.*failed" },

  // POS / inventory / business data
  { code:"OEVS01", subsystem:"V", cause:"S", category:"POS", title:"Sale validation failed", userMessage:"The sale could not be completed.", internalDescription:"Sale/cart/tender validation failed before persistence.", severity:"ERROR", retryable:false, matchPattern:"sale.*validation|cart.*invalid|checkout.*invalid" },
  { code:"OEVN01", subsystem:"V", cause:"N", category:"Inventory", title:"Insufficient stock", userMessage:"There is not enough stock to complete this action.", internalDescription:"Requested stock quantity exceeds available inventory.", severity:"INFO", retryable:false, matchPattern:"insufficient stock|stock.*not enough" },
  { code:"OEVB01", subsystem:"V", cause:"B", category:"Inventory", title:"Batch or expiry issue", userMessage:"The required stock batch could not be used.", internalDescription:"Batch/expiry/FEFO allocation failed.", severity:"ERROR", retryable:false, matchPattern:"batch.*missing|expired batch|FEFO|expiry.*failed" },
  { code:"OEBP01", subsystem:"B", cause:"P", category:"Purchasing", title:"Purchase validation failed", userMessage:"The purchase could not be completed.", internalDescription:"Purchase order/receipt/invoice validation failed.", severity:"ERROR", retryable:false, matchPattern:"purchase.*invalid|receipt.*mismatch|invoice.*mismatch" },
  { code:"OEKC01", subsystem:"K", cause:"C", category:"Customer", title:"Customer unavailable", userMessage:"The customer record could not be used.", internalDescription:"Customer missing/inactive/duplicate conflict.", severity:"ERROR", retryable:false, matchPattern:"customer not found|duplicate customer|customer.*inactive" },

  // Files/reporting/AI/jobs/trusted runtime
  { code:"OEGI01", subsystem:"G", cause:"I", category:"Import", title:"Import validation failed", userMessage:"The import file could not be processed.", internalDescription:"CSV/file parse, required-column or mapping validation failed.", severity:"ERROR", retryable:false, matchPattern:"CSV|import.*failed|required column|unsupported file" },
  { code:"OEQR01", subsystem:"Q", cause:"R", category:"Reporting", title:"Report definition failed", userMessage:"The report could not be generated.", internalDescription:"Report definition/datasource/query failed.", severity:"ERROR", retryable:false, matchPattern:"report.*failed|datasource.*missing|report.*query" },
  { code:"OEJP01", subsystem:"J", cause:"P", category:"AI", title:"AI provider unavailable", userMessage:"The assistant is temporarily unavailable.", internalDescription:"AI provider/model request failed or provider unavailable.", severity:"ERROR", retryable:true, matchPattern:"Gemini|AI provider|model.*unavailable" },
  { code:"OEJJ01", subsystem:"J", cause:"J", category:"Jobs", title:"Background job failed", userMessage:"A background operation could not be completed.", internalDescription:"Generic platform background job failed.", severity:"ERROR", retryable:true, matchPattern:"job failed|platform action job" },
  { code:"OEJR01", subsystem:"J", cause:"R", category:"Jobs", title:"Background job retries exhausted", userMessage:"A background operation could not be completed after retries.", internalDescription:"Background job reached maximum attempts and is permanently failed.", severity:"ERROR", retryable:false, matchPattern:"attempts.*5|retries exhausted|max attempts" },
  { code:"OEXR01", subsystem:"X", cause:"R", category:"Trusted Runtime", title:"Unregistered capability blocked", userMessage:"This operation is not registered in OneEngine.", internalDescription:"Trusted Runtime blocked an unregistered mutation/capability.", severity:"ERROR", retryable:false, matchPattern:"UNREGISTERED_CAPABILITY|Trusted Runtime API gate" },
  { code:"OEXC01", subsystem:"X", cause:"C", category:"Trusted Runtime", title:"Capability mismatch", userMessage:"This operation failed a trusted-runtime check.", internalDescription:"Trusted Runtime capability does not match the requested operation.", severity:"ERROR", retryable:false, matchPattern:"CAPABILITY_MISMATCH" },

  { code:"OEXU01", subsystem:"X", cause:"U", category:"Unknown", title:"Unclassified platform error", userMessage:"OneEngine could not complete this request.", internalDescription:"No registered diagnostic rule matched the failure. Use only when a more specific classification is unavailable.", severity:"ERROR", retryable:false, matchPattern:"" },
]);

export const DEBUG_CODE_RE = /^OE[A-Z]{2}[0-9]{2}$/;
export const LEGACY_DEBUG_CODE_RE = /^OE[A-Z][0-9]{2,3}$/;

const byCode = new Map(BUILTIN_DEBUG_CODES.map((item) => [item.code, item]));
const legacyMap = new Map(BUILTIN_DEBUG_CODES.filter((item) => item.legacyCode).map((item) => [item.legacyCode, item.code]));

export function createDebugReference() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function normalizeDebugCode(code) {
  const value = String(code || "").toUpperCase();
  if (DEBUG_CODE_RE.test(value)) return value;
  return legacyMap.get(value) || value;
}

export function builtinDebugCode(code) {
  return byCode.get(normalizeDebugCode(code)) || null;
}

export function classifyDebugCode(error, status = 500) {
  const explicit = normalizeDebugCode(error?.oeCode || error?.debugCode || "");
  if (DEBUG_CODE_RE.test(explicit)) return explicit;

  const technicalCode = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error || "");
  const haystack = `${technicalCode} ${message}`;

  // Exact domain codes take priority over fuzzy message matching.
  const domainCodeMap = {
    USER_NOT_FOUND:"OEUF01", INVALID_CREDENTIALS:"OEUP01", INVALID_PASSWORD:"OEUP01",
    ACCOUNT_LOCKED:"OEUL01", USER_DISABLED:"OEUD01", PASSWORD_EXPIRED:"OEUE01",
    MUST_CHANGE_PASSWORD:"OEUC01", PASSWORD_CHANGE_REQUIRED:"OEUC01",
    LOGIN_HOURS_RESTRICTED:"OEUH01", LOGIN_IP_RESTRICTED:"OEUI01", LOGIN_IP_POLICY_EMPTY:"OEUI01",
    SESSION_REVOKED:"OEUS01", SESSION_EXPIRED:"OEUS01", SESSION_INACTIVITY_TIMEOUT:"OEUS01",
    SESSION_IP_CHANGED:"OEUI01", SESSION_DOMAIN_CHANGED:"OEUS01",
    GOOGLE_SSO_REQUIRED:"OEUG01", SSO_NOT_CONNECTED:"OEUG01",
    LOGIN_INPUT_REQUIRED:"OEUV01", INVALID_PIN:"OEUP02", PIN_NOT_SET:"OEUP03",
    IDENTITY_DATABASE_UNAVAILABLE:"OEDC01",
    STEP_UP_REQUIRED:"OERS01", RESOURCE_BLOCKED:"OERS01",
    NOT_LICENSED:"OEPE01", NOT_ENTITLED:"OEPE01", NOT_INSTALLED:"OEPD01",
    PROVIDER_TIMEOUT:"OEIC02", AUTH_FAILED:"OEIA01", PROVIDER_NOT_CONFIGURED:"OEIA01",
    UNREGISTERED_CAPABILITY:"OEXR01", CAPABILITY_MISMATCH:"OEXC01",
    RELEASE_UPGRADE_FAILED:"OEPU01", WORKFLOW_EXECUTION_FAILED:"OEWE01",
  };
  if (domainCodeMap[technicalCode]) return domainCodeMap[technicalCode];

  if (/too many clients|remaining connection slots|pool.*exhaust|connection pool/i.test(haystack)) return "OEDP01";
  if (/disk full|no space left|storage.*limit|database.*size.*limit|storage quota/i.test(haystack)) return "OEDS01";
  if (/migration .* failed|schema_migrations|DDL/i.test(haystack)) return "OEDM01";
  if (/deadlock|serialization failure|lock timeout|could not serialize/i.test(haystack)) return "OEDT01";
  if (/quota|allowance|resource limit|usage limit|exhaust|compute.*suspend|project.*suspend|billing.*limit/i.test(haystack)) return "OEDQ01";
  if (/ECONNREFUSED|connection terminated|connection refused|database.*unavailable|failed to connect/i.test(haystack)) return "OEDC01";
  if (/SQLSTATE|constraint|duplicate key/i.test(haystack)) return "OEDX01";
  if (/timeout|timed out|ETIMEDOUT/i.test(haystack)) return "OENT01";

  if (/account is disabled/i.test(haystack)) return "OEUD01";
  if (/LOGIN_HOURS_RESTRICTED|not permitted at this time/i.test(haystack)) return "OEUH01";
  if (/LOGIN_IP_RESTRICTED|LOGIN_IP_POLICY_EMPTY|IP address.*not permitted/i.test(haystack)) return "OEUI01";
  if (/passkey|webauthn/i.test(haystack) && /fail|invalid|reject|expired/i.test(haystack)) return "OEUK01";
  if (/MFA|TOTP|verification/i.test(haystack) && /fail|invalid|expired/i.test(haystack)) return "OEUM01";

  if (/workflow.*resource|resource.*missing|record.*no longer exists|workflow version.*missing/i.test(haystack)) return "OEWR01";
  if (/formula.*failed|formula.*invalid|evaluate.*formula/i.test(haystack)) return "OEWF01";
  if (/condition.*failed|evaluate.*condition/i.test(haystack)) return "OEWC01";
  if (/workflow.*validation|invalid workflow|no executable actions/i.test(haystack)) return "OEWV01";
  if (/workflow automation actor|no active RBAC execution user/i.test(haystack)) return "OEWU01";
  if (/subflow.*failed|child run.*failed/i.test(haystack)) return "OEWS01";
  if (/workflow.*timeout|action.*timeout/i.test(haystack)) return "OEWT01";
  if (/resume.*workflow|scheduled path|WAIT.*failed/i.test(haystack)) return "OEWW01";
  if (/action failed|workflow action|step.*failed/i.test(haystack)) return "OEWA01";
  if (/workflow.*failed|automation.*failed/i.test(haystack)) return "OEWE01";

  if (/package.*upgrade|release.*upgrade|update.*failed/i.test(haystack)) return "OEPU01";
  if (/dependency.*missing|required package|manifest.*missing/i.test(haystack)) return "OEPD01";
  if (/package.*install|install.*failed/i.test(haystack)) return "OEPI01";

  if (/trial.*expired/i.test(haystack)) return "OEPT01";
  if (/NOT_LICENSED|NOT_ENTITLED|entitlement.*inactive|suspended_by_entitlement/i.test(haystack)) return "OEPE01";
  if (/manifest.*invalid|trusted package|catalogue.*invalid/i.test(haystack)) return "OEPM01";

  if (/token refresh|refresh token|token.*expired/i.test(haystack)) return "OEIT01";
  if (/mapping.*invalid|required mapping|field mapping/i.test(haystack)) return "OEIM01";
  if (/sync conflict|reconciliation conflict|record mismatch/i.test(haystack)) return "OEIX01";
  if (/provider rejected|remote.*rejected/i.test(haystack)) return "OEIP01";
  if (/webhook.*failed|signature.*invalid/i.test(haystack)) return "OEIW01";
  if (/provider.*rate limit|429.*provider|throttl/i.test(haystack)) return "OEIR01";
  if (/oauth|authentication.*provider|invalid credential|token exchange|unauthorized provider/i.test(haystack)) return "OEIA01";
  if (/connector.*failed|provider.*unavailable|integration.*connection/i.test(haystack)) return "OEIC01";

  if (/payment.*declined|\bDECLINED\b/i.test(haystack)) return "OEMD01";
  if (/payment.*timeout|terminal.*timeout/i.test(haystack)) return "OEMT01";
  if (/payment.*not configured|terminal.*not configured|invalid payment line|Payments total/i.test(haystack)) return "OEMC01";
  if (/refund.*failed|refund.*rejected/i.test(haystack)) return "OEMR01";
  if (/printer.*offline|printer.*not configured|print.*failed/i.test(haystack)) return "OEHP01";
  if (/terminal.*offline|terminal.*unavailable|terminal.*disconnected/i.test(haystack)) return "OEHT01";
  if (/scanner.*disconnected|scanner.*unavailable/i.test(haystack)) return "OEHS01";
  if (/cash drawer.*failed|drawer.*failed/i.test(haystack)) return "OEHD01";

  if (/insufficient stock|stock.*not enough/i.test(haystack)) return "OEVN01";
  if (/batch.*missing|expired batch|FEFO|expiry.*failed/i.test(haystack)) return "OEVB01";
  if (/purchase.*invalid|receipt.*mismatch|invoice.*mismatch/i.test(haystack)) return "OEBP01";
  if (/customer not found|duplicate customer|customer.*inactive/i.test(haystack)) return "OEKC01";
  if (/CSV|import.*failed|required column|unsupported file/i.test(haystack)) return "OEGI01";
  if (/report.*failed|datasource.*missing|report.*query/i.test(haystack)) return "OEQR01";
  if (/Gemini|AI provider|model.*unavailable/i.test(haystack)) return "OEJP01";

  if (/company context|tenant context|acting company/i.test(haystack)) return "OETC01";
  if (/store context|selected store|store.*assigned/i.test(haystack)) return "OETS01";
  if (/MFA|TOTP|passkey|verification failed/i.test(haystack)) return "OEUM01";
  if (/licen[cs]e|entitlement|expired.*package/i.test(haystack)) return "OELE01";
  if (/indexeddb|cache.*failed|local storage.*failed/i.test(haystack)) return "OECI01";
  if (/offline.*sync|queue.*sync|sync.*failed/i.test(haystack)) return "OECS01";
  if (/security policy|RESOURCE_BLOCKED|STEP_UP_REQUIRED/i.test(haystack)) return "OERS01";

  if (status === 401) return "OEUA01";
  if (status === 403) return "OERP01";
  if (status === 404) return "OEAF01";
  if (status === 429) return "OEAR01";
  if ([502,503,504].includes(status)) return "OEAA01";
  return status >= 500 ? "OEAE01" : "OEXU01";
}

export async function resolveDebugDefinition(db, error, status = 500) {
  const technical = `${String(error?.code || "")} ${String(error?.message || error || "")}`;
  try {
    const result = await db(
      `SELECT code,category,title,user_message,internal_description,severity,retryable,match_pattern,subsystem_key,cause_key,legacy_code
         FROM oneengine_debug_codes
        WHERE active=TRUE
        ORDER BY built_in DESC,sort_order,code`
    );
    for (const row of result.rows || []) {
      if (!row.match_pattern) continue;
      try {
        if (new RegExp(row.match_pattern, "i").test(technical)) {
          return {
            code: normalizeDebugCode(row.code),
            category: row.category,
            title: row.title,
            userMessage: row.user_message,
            internalDescription: row.internal_description,
            severity: row.severity,
            retryable: row.retryable === true,
          };
        }
      } catch {}
    }
    const code = classifyDebugCode(error, status);
    const row = (result.rows || []).find((item) => normalizeDebugCode(item.code) === code);
    if (row) return {
      code,
      category: row.category,
      title: row.title,
      userMessage: row.user_message,
      internalDescription: row.internal_description,
      severity: row.severity,
      retryable: row.retryable === true,
    };
  } catch {}
  return builtinDebugCode(classifyDebugCode(error, status)) || builtinDebugCode("OEXU01");
}

export async function writeDebugEvent(db, {
  reference,
  definition,
  error,
  status,
  req = null,
  environment = process.env.NODE_ENV || "production",
} = {}) {
  if (!db || !definition?.code) return;
  try {
    await db(
      `INSERT INTO oneengine_debug_events
        (reference,code,company_id,user_id,endpoint,http_method,http_status,technical_code,technical_message,stack_trace,environment,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [
        reference,
        definition.code,
        req?.user?.companyId || null,
        req?.user?.id || null,
        req?.originalUrl || req?.path || null,
        req?.method || null,
        status || null,
        error?.code ? String(error.code).slice(0,160) : null,
        String(error?.message || error || "").slice(0,2000),
        error?.stack ? String(error.stack).slice(0,12000) : null,
        environment,
      ]
    );
  } catch (writeError) {
    console.error("OneEngine Debug event write failed:", writeError?.message || writeError);
  }
}

export async function buildDebugPayload(db, { error, status = 500, req = null } = {}) {
  const definition = await resolveDebugDefinition(db, error, status);
  const reference = createDebugReference();
  await writeDebugEvent(db, { reference, definition, error, status, req });
  return {
    success:false,
    code:definition.code,
    oeCode:definition.code,
    title:definition.title,
    message:definition.userMessage,
    retryable:definition.retryable === true,
    reference,
  };
}
