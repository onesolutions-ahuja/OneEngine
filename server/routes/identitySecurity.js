import express from "express";
import { loadSecuritySettings, validateLoginHours } from "../services/identitySecurity.js";

const COMPLEXITIES = new Set(["NONE","ALPHA_NUMERIC","ALPHA_NUMERIC_SPECIAL","NUM_UPPER_LOWER","NUM_UPPER_LOWER_SPECIAL","THREE_OF_FOUR"]);
const SCOPES = new Set(["COMPANY","ROLE","USER"]);

function bool(value, fallback = false) { return value === undefined ? fallback : value === true; }
function int(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}
function safeInet(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 64 || !/^[0-9a-fA-F:.]+$/.test(text)) return null;
  return text;
}

export default function createIdentitySecurityRouter({ authenticate, authorize, db, writeAudit }) {
  const router = express.Router();
  const manage = [authenticate, authorize("settings.manage")];

  router.get("/security/settings", ...manage, async (req, res) => {
    const settings = await loadSecuritySettings(db, req.user.companyId);
    const [policies, trustedRanges] = await Promise.all([
      db(`SELECT p.*,
          CASE p.scope_type WHEN 'ROLE' THEN r.name WHEN 'USER' THEN u.username ELSE 'Company default' END AS scope_name,
          COALESCE((SELECT COUNT(*) FROM identity_security_ip_ranges i WHERE i.policy_id=p.id AND i.range_type='LOGIN_ALLOWED' AND i.active=TRUE),0)::int AS login_ip_range_count
        FROM identity_access_policies p
        LEFT JOIN roles r ON p.scope_type='ROLE' AND r.id=p.scope_id AND r.company_id=p.company_id
        LEFT JOIN users u ON p.scope_type='USER' AND u.id=p.scope_id AND u.company_id=p.company_id
        WHERE p.company_id=$1 ORDER BY CASE p.scope_type WHEN 'COMPANY' THEN 1 WHEN 'ROLE' THEN 2 ELSE 3 END,p.priority,p.name`, [req.user.companyId]),
      db(`SELECT id,label,start_ip::text,end_ip::text,active,created_at
            FROM identity_security_ip_ranges
           WHERE company_id=$1 AND range_type='TRUSTED' AND policy_id IS NULL
           ORDER BY created_at`, [req.user.companyId]),
    ]);
    res.json({ success: true, data: { settings, policies: policies.rows, trustedRanges: trustedRanges.rows } });
  });

  router.put("/security/settings", ...manage, async (req, res) => {
    const current = await loadSecuritySettings(db, req.user.companyId);
    const body = req.body || {};
    const complexity = COMPLEXITIES.has(String(body.passwordComplexity || current.password_complexity))
      ? String(body.passwordComplexity || current.password_complexity) : current.password_complexity;
    const values = {
      passwordExpiryDays: int(body.passwordExpiryDays, current.password_expiry_days, 0, 3650),
      passwordHistoryCount: int(body.passwordHistoryCount, current.password_history_count, 0, 24),
      minimumPasswordLength: int(body.minimumPasswordLength, current.minimum_password_length, 8, 128),
      passwordComplexity: complexity,
      maximumInvalidLoginAttempts: int(body.maximumInvalidLoginAttempts, current.maximum_invalid_login_attempts, 0, 100),
      lockoutMinutes: int(body.lockoutMinutes, current.lockout_minutes, 0, 10080),
      lockoutForever: bool(body.lockoutForever, current.lockout_forever),
      minimumPasswordLifetimeHours: int(body.minimumPasswordLifetimeHours, current.minimum_password_lifetime_hours, 0, 720),
      sessionInactivityMinutes: int(body.sessionInactivityMinutes, current.session_inactivity_minutes, 0, 10080),
      maximumSessionHours: int(body.maximumSessionHours, current.maximum_session_hours, 1, 720),
      enforceLoginIpEveryRequest: bool(body.enforceLoginIpEveryRequest, current.enforce_login_ip_every_request),
      lockSessionToIp: bool(body.lockSessionToIp, current.lock_session_to_ip),
      lockSessionToDomain: bool(body.lockSessionToDomain, current.lock_session_to_domain),
      forceLogoutOnTimeout: bool(body.forceLogoutOnTimeout, current.force_logout_on_timeout),
      sessionTimeoutWarningMinutes: int(body.sessionTimeoutWarningMinutes, current.session_timeout_warning_minutes, 0, 60),
      terminateSessionsOnPasswordReset: bool(body.terminateSessionsOnPasswordReset, current.terminate_sessions_on_password_reset),
    };
    if (values.passwordExpiryDays > 0 && values.passwordHistoryCount === 0) {
      return res.status(400).json({ success:false, code:"PASSWORD_HISTORY_REQUIRED", message:"Password history cannot be disabled while password expiration is enabled." });
    }
    if (values.lockoutForever) values.lockoutMinutes = 0;
    const result = await db(
      `UPDATE identity_security_settings SET
        password_expiry_days=$1,password_history_count=$2,minimum_password_length=$3,password_complexity=$4,
        maximum_invalid_login_attempts=$5,lockout_minutes=$6,lockout_forever=$7,minimum_password_lifetime_hours=$8,
        session_inactivity_minutes=$9,maximum_session_hours=$10,enforce_login_ip_every_request=$11,
        lock_session_to_ip=$12,lock_session_to_domain=$13,force_logout_on_timeout=$14,session_timeout_warning_minutes=$15,
        terminate_sessions_on_password_reset=$16,updated_by=$17,updated_at=NOW()
       WHERE company_id=$18 RETURNING *`,
      [values.passwordExpiryDays,values.passwordHistoryCount,values.minimumPasswordLength,values.passwordComplexity,
       values.maximumInvalidLoginAttempts,values.lockoutMinutes,values.lockoutForever,values.minimumPasswordLifetimeHours,
       values.sessionInactivityMinutes,values.maximumSessionHours,values.enforceLoginIpEveryRequest,
       values.lockSessionToIp,values.lockSessionToDomain,values.forceLogoutOnTimeout,values.sessionTimeoutWarningMinutes,
       values.terminateSessionsOnPasswordReset,req.user.id,req.user.companyId]
    );
    await writeAudit?.(req.user.companyId, req.user.id, "security.settings_updated", "identity_security_settings", req.user.companyId, values);
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/security/principals", ...manage, async (req, res) => {
    const [roles, users] = await Promise.all([
      db("SELECT id,name FROM roles WHERE company_id=$1 ORDER BY name", [req.user.companyId]),
      db(`SELECT u.id,u.username,u.full_name,u.email,s.failed_login_attempts,s.locked_until,s.locked_indefinitely
            FROM users u LEFT JOIN identity_user_security_state s ON s.user_id=u.id
           WHERE u.company_id=$1 AND u.active=TRUE ORDER BY u.full_name,u.username`, [req.user.companyId]),
    ]);
    res.json({ success: true, data: { roles: roles.rows, users: users.rows } });
  });

  router.post("/security/policies", ...manage, async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    const scopeType = String(b.scopeType || "COMPANY").toUpperCase();
    const scopeId = b.scopeId || null;
    if (!name || !SCOPES.has(scopeType)) return res.status(400).json({ success:false, message:"Name and valid scope are required" });
    if (scopeType === "COMPANY" && scopeId) return res.status(400).json({ success:false, message:"Company policy cannot have a scope ID" });
    if (scopeType !== "COMPANY" && !scopeId) return res.status(400).json({ success:false, message:"Role/user policy requires a scope ID" });
    const loginHours = validateLoginHours(b.loginHours || {});
    const result = await db(
      `INSERT INTO identity_access_policies(company_id,name,description,scope_type,scope_id,priority,timezone,login_hours,enforce_login_ip,active,
        mfa_required,phishing_resistant_mfa_required,required_login_assurance,trusted_device_days,trust_sso_mfa,
        device_activation_required,skip_device_activation_on_trusted_network,created_by,updated_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18) RETURNING *`,
      [req.user.companyId,name,String(b.description||"").trim()||null,scopeType,scopeId,int(b.priority,100,0,10000),
       String(b.timezone||"").trim()||null,JSON.stringify(loginHours),b.enforceLoginIp===true,b.active!==false,
       b.mfaRequired==null?null:b.mfaRequired===true,b.phishingResistantMfaRequired==null?null:b.phishingResistantMfaRequired===true,
       b.requiredLoginAssurance==null?null:(String(b.requiredLoginAssurance).toUpperCase()==="HIGH"?"HIGH":"STANDARD"),
       b.trustedDeviceDays==null?null:int(b.trustedDeviceDays,30,0,3650),b.trustSsoMfa==null?null:b.trustSsoMfa===true,
       b.deviceActivationRequired==null?null:b.deviceActivationRequired===true,
       b.skipDeviceActivationOnTrustedNetwork==null?null:b.skipDeviceActivationOnTrustedNetwork!==false,
       req.user.id]
    );
    await writeAudit?.(req.user.companyId, req.user.id, "security.policy_created", "identity_access_policy", result.rows[0].id, { name, scopeType, scopeId });
    res.status(201).json({ success:true, data:result.rows[0] });
  });

  router.put("/security/policies/:id", ...manage, async (req, res) => {
    const current = await db("SELECT * FROM identity_access_policies WHERE id=$1 AND company_id=$2", [req.params.id,req.user.companyId]);
    if (!current.rows.length) return res.status(404).json({ success:false, message:"Security policy not found" });
    const row = current.rows[0], b=req.body||{};
    const name = b.name === undefined ? row.name : String(b.name||"").trim();
    const loginHours = b.loginHours === undefined ? row.login_hours : validateLoginHours(b.loginHours);
    const enforceLoginIp = b.enforceLoginIp === undefined ? row.enforce_login_ip : b.enforceLoginIp===true;
    if (!name) return res.status(400).json({success:false,message:"Policy name is required"});
    if (enforceLoginIp) {
      const ranges = await db("SELECT COUNT(*)::int count FROM identity_security_ip_ranges WHERE policy_id=$1 AND range_type='LOGIN_ALLOWED' AND active=TRUE",[row.id]);
      if (Number(ranges.rows[0]?.count||0)===0) return res.status(409).json({success:false,code:"LOGIN_IP_RANGE_REQUIRED",message:"Add at least one allowed login IP range before enabling IP restriction."});
    }
    const result=await db(
      `UPDATE identity_access_policies SET name=$1,description=$2,priority=$3,timezone=$4,login_hours=$5::jsonb,enforce_login_ip=$6,active=$7,
       mfa_required=$8,phishing_resistant_mfa_required=$9,required_login_assurance=$10,trusted_device_days=$11,trust_sso_mfa=$12,
       device_activation_required=$13,skip_device_activation_on_trusted_network=$14,
       updated_by=$15,updated_at=NOW() WHERE id=$16 AND company_id=$17 RETURNING *`,
      [name,b.description===undefined?row.description:String(b.description||"").trim()||null,int(b.priority,row.priority,0,10000),
       b.timezone===undefined?row.timezone:String(b.timezone||"").trim()||null,JSON.stringify(loginHours),enforceLoginIp,
       b.active===undefined?row.active:b.active===true,
       b.mfaRequired===undefined?row.mfa_required:(b.mfaRequired==null?null:b.mfaRequired===true),
       b.phishingResistantMfaRequired===undefined?row.phishing_resistant_mfa_required:(b.phishingResistantMfaRequired==null?null:b.phishingResistantMfaRequired===true),
       b.requiredLoginAssurance===undefined?row.required_login_assurance:(b.requiredLoginAssurance==null?null:(String(b.requiredLoginAssurance).toUpperCase()==="HIGH"?"HIGH":"STANDARD")),
       b.trustedDeviceDays===undefined?row.trusted_device_days:(b.trustedDeviceDays==null?null:int(b.trustedDeviceDays,30,0,3650)),
       b.trustSsoMfa===undefined?row.trust_sso_mfa:(b.trustSsoMfa==null?null:b.trustSsoMfa===true),
       b.deviceActivationRequired===undefined?row.device_activation_required:(b.deviceActivationRequired==null?null:b.deviceActivationRequired===true),
       b.skipDeviceActivationOnTrustedNetwork===undefined?row.skip_device_activation_on_trusted_network:(b.skipDeviceActivationOnTrustedNetwork==null?null:b.skipDeviceActivationOnTrustedNetwork!==false),
       req.user.id,row.id,req.user.companyId]
    );
    await writeAudit?.(req.user.companyId, req.user.id, "security.policy_updated", "identity_access_policy", row.id, { name, enforceLoginIp });
    res.json({success:true,data:result.rows[0]});
  });

  router.get("/security/policies/:id/ip-ranges", ...manage, async (req,res)=>{
    const r=await db(`SELECT id,label,start_ip::text,end_ip::text,active,created_at FROM identity_security_ip_ranges
      WHERE company_id=$1 AND policy_id=$2 AND range_type='LOGIN_ALLOWED' ORDER BY created_at`,[req.user.companyId,req.params.id]);
    res.json({success:true,data:r.rows});
  });

  router.post("/security/policies/:id/ip-ranges", ...manage, async(req,res)=>{
    const p=await db("SELECT id FROM identity_access_policies WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId]);
    if(!p.rows.length)return res.status(404).json({success:false,message:"Security policy not found"});
    const start=safeInet(req.body?.startIp),end=safeInet(req.body?.endIp||req.body?.startIp);
    if(!start||!end)return res.status(400).json({success:false,message:"Valid start and end IP addresses are required"});
    try{
      const r=await db(`INSERT INTO identity_security_ip_ranges(company_id,policy_id,range_type,label,start_ip,end_ip,created_by)
        VALUES($1,$2,'LOGIN_ALLOWED',$3,$4::inet,$5::inet,$6) RETURNING id,label,start_ip::text,end_ip::text,active`,
        [req.user.companyId,req.params.id,String(req.body?.label||"").trim()||null,start,end,req.user.id]);
      res.status(201).json({success:true,data:r.rows[0]});
    }catch(error){return res.status(400).json({success:false,message:"IP range is invalid or mixes IPv4 and IPv6"});}
  });

  router.post("/security/trusted-ranges", ...manage, async(req,res)=>{
    const start=safeInet(req.body?.startIp),end=safeInet(req.body?.endIp||req.body?.startIp);
    if(!start||!end)return res.status(400).json({success:false,message:"Valid start and end IP addresses are required"});
    try{
      const r=await db(`INSERT INTO identity_security_ip_ranges(company_id,range_type,label,start_ip,end_ip,created_by)
        VALUES($1,'TRUSTED',$2,$3::inet,$4::inet,$5) RETURNING id,label,start_ip::text,end_ip::text,active`,
        [req.user.companyId,String(req.body?.label||"").trim()||null,start,end,req.user.id]);
      res.status(201).json({success:true,data:r.rows[0]});
    }catch(error){return res.status(400).json({success:false,message:"IP range is invalid or mixes IPv4 and IPv6"});}
  });

  router.delete("/security/ip-ranges/:id", ...manage, async(req,res)=>{
    const r=await db("DELETE FROM identity_security_ip_ranges WHERE id=$1 AND company_id=$2 RETURNING id",[req.params.id,req.user.companyId]);
    if(!r.rows.length)return res.status(404).json({success:false,message:"IP range not found"});
    res.json({success:true});
  });

  async function loadLoginHistory(req, limitOverride = null) {
    const limit=Math.min(20000,Math.max(1,limitOverride || Number(req.query.limit)||100));
    const status=String(req.query.status||"").toUpperCase();
    const authMethod=String(req.query.authMethod||"").toUpperCase();
    const userId=String(req.query.userId||"").trim()||null;
    const from=String(req.query.from||"").trim()||null;
    const to=String(req.query.to||"").trim()||null;
    const ip=String(req.query.ip||"").trim()||null;
    const r=await db(`SELECT h.*,u.username,u.full_name FROM identity_login_history h
      LEFT JOIN users u ON u.id=h.user_id
      WHERE h.company_id=$1
        AND ($2='' OR h.status=$2)
        AND ($3='' OR h.auth_method=$3)
        AND ($4::uuid IS NULL OR h.user_id=$4)
        AND ($5::timestamptz IS NULL OR h.occurred_at >= $5::timestamptz)
        AND ($6::timestamptz IS NULL OR h.occurred_at <= $6::timestamptz)
        AND ($7::text IS NULL OR h.ip_address::text=$7 OR h.forwarded_for ILIKE '%'||$7||'%')
      ORDER BY h.occurred_at DESC LIMIT $8`,[req.user.companyId,status,authMethod,userId,from,to,ip,limit]);
    return r.rows;
  }

  router.get("/security/login-history", ...manage, async(req,res)=>{
    res.json({success:true,data:await loadLoginHistory(req)});
  });

  router.get("/security/login-history/export.csv", ...manage, async(req,res)=>{
    const rows=await loadLoginHistory(req,20000);
    const columns=["occurred_at","username","full_name","login_identifier","status","reason","ip_address","forwarded_for","auth_method","application","login_url","tls_protocol","platform","browser","user_agent"];
    const csv=[columns.join(","),...rows.map(row=>columns.map(key=>{
      const value=String(row[key]??"").replace(/"/g,'""');
      return `"${value}"`;
    }).join(","))].join("\n");
    res.setHeader("Content-Type","text/csv; charset=utf-8");
    res.setHeader("Content-Disposition",`attachment; filename="oneengine-login-history.csv"`);
    res.send(csv);
  });

  router.get("/security/sessions", ...manage, async(req,res)=>{
    const r=await db(`SELECT s.id,s.user_id,u.username,u.full_name,s.issued_at,s.last_seen_at,s.expires_at,
      s.ip_address::text,s.origin_host,s.user_agent,s.auth_method,s.revoked_at,s.revoke_reason
      FROM identity_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.company_id=$1 ORDER BY s.issued_at DESC LIMIT 500`,[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });

  router.post("/security/sessions/:id/revoke", ...manage, async(req,res)=>{
    const r=await db(`UPDATE identity_sessions SET revoked_at=COALESCE(revoked_at,NOW()),revoke_reason=COALESCE(revoke_reason,'ADMIN_REVOKED')
      WHERE id=$1 AND company_id=$2 RETURNING id`,[req.params.id,req.user.companyId]);
    if(!r.rows.length)return res.status(404).json({success:false,message:"Session not found"});
    await writeAudit?.(req.user.companyId,req.user.id,"security.session_revoked","identity_session",req.params.id,{});
    res.json({success:true});
  });

  router.post("/security/users/:userId/unlock", ...manage, async(req,res)=>{
    const user=await db("SELECT id FROM users WHERE id=$1 AND company_id=$2",[req.params.userId,req.user.companyId]);
    if(!user.rows.length)return res.status(404).json({success:false,message:"User not found"});
    await db(`INSERT INTO identity_user_security_state(user_id,company_id,failed_login_attempts,locked_until,locked_indefinitely,updated_at)
      VALUES($1,$2,0,NULL,FALSE,NOW())
      ON CONFLICT(user_id) DO UPDATE SET failed_login_attempts=0,locked_until=NULL,locked_indefinitely=FALSE,updated_at=NOW()`,[req.params.userId,req.user.companyId]);
    await writeAudit?.(req.user.companyId,req.user.id,"security.user_unlocked","user",req.params.userId,{});
    res.json({success:true});
  });

  router.post("/security/users/:userId/revoke-sessions", ...manage, async(req,res)=>{
    const user=await db("SELECT id FROM users WHERE id=$1 AND company_id=$2",[req.params.userId,req.user.companyId]);
    if(!user.rows.length)return res.status(404).json({success:false,message:"User not found"});
    await db("UPDATE identity_sessions SET revoked_at=COALESCE(revoked_at,NOW()),revoke_reason=COALESCE(revoke_reason,'ADMIN_REVOKED_ALL') WHERE user_id=$1 AND company_id=$2 AND revoked_at IS NULL",[req.params.userId,req.user.companyId]);
    await db(`INSERT INTO identity_user_security_state(user_id,company_id,sessions_revoked_at,updated_at) VALUES($1,$2,NOW(),NOW())
      ON CONFLICT(user_id) DO UPDATE SET sessions_revoked_at=NOW(),updated_at=NOW()`,[req.params.userId,req.user.companyId]);
    res.json({success:true});
  });

  return router;
}
