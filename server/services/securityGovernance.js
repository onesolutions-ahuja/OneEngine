import crypto from "node:crypto";

export function normalizeTrustedOrigin(value,{allowLocalhost=false}={}){
  try{
    const url=new URL(String(value||"").trim());
    if(url.username||url.password||url.pathname!=="/"||url.search||url.hash)return null;
    const local=["localhost","127.0.0.1","::1"].includes(url.hostname);
    if(url.protocol!=="https:" && !(allowLocalhost&&local&&url.protocol==="http:"))return null;
    return url.origin;
  }catch{return null;}
}

export function normalizeScopes(value){
  const rows=Array.isArray(value)?value:String(value||"").split(/[\s,]+/);
  return [...new Set(rows.map(v=>String(v||"").trim()).filter(Boolean))].sort();
}

export async function loadApiPolicy(db,companyId){
  const r=await db("SELECT * FROM security_api_policies WHERE company_id=$1",[companyId]);
  return r.rows[0]||{
    company_id:companyId,enforce_connected_app_policy:false,require_pkce:true,
    require_high_assurance_for_app_admin:true,default_refresh_token_days:30,max_refresh_token_days:180,
    allowed_grant_types:["authorization_code","refresh_token"],
  };
}

export async function connectedAppDecision(db,{companyId,appKey,connectionId=null,requestedScopes=[]}){
  const api=await loadApiPolicy(db,companyId);
  if(!api.enforce_connected_app_policy)return {allowed:true,reason:"POLICY_NOT_ENFORCED",policy:null,api};
  const r=await db(`SELECT * FROM security_connected_app_policies
    WHERE company_id=$1 AND active=TRUE AND (app_key=$2 OR ($3::uuid IS NOT NULL AND integration_connection_id=$3))
    ORDER BY CASE WHEN integration_connection_id=$3 THEN 0 ELSE 1 END LIMIT 1`,
    [companyId,String(appKey||"").toLowerCase(),connectionId||null]);
  const policy=r.rows[0];
  if(!policy)return {allowed:false,reason:"CONNECTED_APP_NOT_APPROVED",policy:null,api};
  const allowed=normalizeScopes(policy.allowed_scopes||[]);
  const requested=normalizeScopes(requestedScopes);
  const missing=allowed.length?requested.filter(scope=>!allowed.includes(scope)):[];
  if(missing.length)return {allowed:false,reason:"OAUTH_SCOPE_NOT_APPROVED",missingScopes:missing,policy,api};
  return {allowed:true,reason:"APPROVED",policy,api};
}

export function certificateMetadata(pem){
  const cert=new crypto.X509Certificate(String(pem||""));
  return {
    subject:cert.subject,issuer:cert.issuer,serialNumber:cert.serialNumber,
    fingerprintSha256:cert.fingerprint256.replace(/:/g,"").toLowerCase(),
    notBefore:new Date(cert.validFrom).toISOString(),notAfter:new Date(cert.validTo).toISOString(),
  };
}

export async function buildSecurityHealth(db,{companyId,env=process.env}){
  const findings=[];
  const add=(key,severity,title,healthy,detail,remediation)=>findings.push({key,severity,title,healthy,detail,remediation});
  const [settings,api,origins,apps,certs,vault,waivers]=await Promise.all([
    db("SELECT * FROM identity_security_settings WHERE company_id=$1",[companyId]),
    loadApiPolicy(db,companyId),
    db("SELECT COUNT(*)::int count FROM security_trusted_origins WHERE company_id=$1 AND active=TRUE",[companyId]),
    db(`SELECT
      (SELECT COUNT(*) FROM integration_connections WHERE company_id=$1 AND enabled=TRUE)::int AS integrations,
      (SELECT COUNT(*) FROM security_connected_app_policies WHERE company_id=$1 AND active=TRUE)::int AS governed`,[companyId]),
    db("SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE active=TRUE AND not_after IS NOT NULL AND not_after<NOW()+INTERVAL '30 days')::int expiring FROM security_certificates WHERE company_id=$1",[companyId]),
    db("SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE active=TRUE AND expires_at IS NOT NULL AND expires_at<NOW())::int expired FROM security_vault_entries WHERE company_id=$1",[companyId]),
    db("SELECT finding_key,reason,expires_at FROM security_health_waivers WHERE company_id=$1 AND (expires_at IS NULL OR expires_at>NOW())",[companyId]),
  ]);
  const s=settings.rows[0]||{};
  add("mfa_required","HIGH","Require MFA",s.mfa_required===true,s.mfa_required?"MFA is required.":"MFA is not required for all users.","Require MFA or use scoped assurance policies.");
  add("phishing_resistant_mfa","MEDIUM","Phishing-resistant MFA",s.phishing_resistant_mfa_required===true,s.phishing_resistant_mfa_required?"Passkey/security-key MFA is required.":"Phishing-resistant MFA is optional.","Require phishing-resistant MFA for privileged roles.");
  add("connected_app_policy","HIGH","Connected-app policy enforcement",api.enforce_connected_app_policy===true,api.enforce_connected_app_policy?"Connected-app approval policy is enforced.":"OAuth connected-app governance is observe-only.","Enable enforcement after approving current connected apps.");
  add("pkce","HIGH","PKCE required",api.require_pkce===true,api.require_pkce?"PKCE is required by governance policy.":"PKCE is not required.","Require PKCE for authorization-code clients.");
  add("trusted_origins","MEDIUM","Trusted origins configured",Number(origins.rows[0]?.count||0)>0,`${Number(origins.rows[0]?.count||0)} trusted origins configured.`,"Add only required HTTPS origins.");
  const integrationCount=Number(apps.rows[0]?.integrations||0), governedCount=Number(apps.rows[0]?.governed||0);
  add("connected_apps_inventory","MEDIUM","Connected apps inventoried",integrationCount===0||governedCount>=integrationCount,`${governedCount} governed policies for ${integrationCount} enabled integration connections.`,"Create a connected-app policy for every enabled OAuth/API integration.");
  add("certificate_expiry","HIGH","Certificates current",Number(certs.rows[0]?.expiring||0)===0,`${Number(certs.rows[0]?.expiring||0)} certificates expire within 30 days.`,"Rotate expiring certificates before their validity window ends.");
  add("vault_expiry","HIGH","Vault credentials current",Number(vault.rows[0]?.expired||0)===0,`${Number(vault.rows[0]?.expired||0)} active vault entries are expired.`,"Rotate or deactivate expired credentials.");
  add("dedicated_encryption_key","HIGH","Dedicated encryption key",Boolean(env.INTEGRATION_ENCRYPTION_KEY),env.INTEGRATION_ENCRYPTION_KEY?"A dedicated integration encryption key is configured.":"Credential encryption currently relies on the legacy key fallback.","Set INTEGRATION_ENCRYPTION_KEY and rotate credentials through a controlled migration.");

  const waiverMap=new Map((waivers.rows||[]).map(w=>[w.finding_key,w]));
  const weighted={HIGH:20,MEDIUM:10,LOW:5};
  let deductions=0;
  const enriched=findings.map(f=>{
    const waiver=waiverMap.get(f.key)||null;
    const waived=Boolean(waiver&&!f.healthy);
    if(!f.healthy&&!waived)deductions+=weighted[f.severity]||5;
    return {...f,waived,waiverReason:waiver?.reason||null,waiverExpiresAt:waiver?.expires_at||null};
  });
  return {score:Math.max(0,100-deductions),findings:enriched,generatedAt:new Date().toISOString()};
}
