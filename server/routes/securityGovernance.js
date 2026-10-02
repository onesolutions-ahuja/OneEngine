import express from "express";
import { encryptCredentials } from "../services/integrationCredentials.js";
import { buildSecurityHealth, certificateMetadata, loadApiPolicy, normalizeScopes, normalizeTrustedOrigin } from "../services/securityGovernance.js";

export default function createSecurityGovernanceRouter({authenticate,authorize,db,writeAudit}){
  const router=express.Router();
  const manage=[authenticate,authorize("settings.manage","security.governance.manage")];
  const healthView=[authenticate,authorize("settings.manage","security.governance.manage","security.health.view")];
  const vaultManage=[authenticate,authorize("settings.manage","security.governance.manage","security.vault.manage")];

  const audit=(req,action,entityType,entityId,details={})=>writeAudit?.(req.user.companyId,req.user.id,action,entityType,entityId,details);

  router.get("/security/governance/api-policy",...manage,async(req,res)=>{
    res.json({success:true,data:await loadApiPolicy(db,req.user.companyId)});
  });

  router.put("/security/governance/api-policy",...manage,async(req,res)=>{
    const current=await loadApiPolicy(db,req.user.companyId);
    const allowedGrantTypes=Array.isArray(req.body?.allowedGrantTypes)?normalizeScopes(req.body.allowedGrantTypes):(current.allowed_grant_types||["authorization_code","refresh_token"]);
    if(allowedGrantTypes.some(x=>!["authorization_code","refresh_token","client_credentials"].includes(x)))return res.status(400).json({success:false,message:"Unsupported OAuth grant type"});
    const defaultDays=Math.max(1,Math.min(3650,Number(req.body?.defaultRefreshTokenDays??current.default_refresh_token_days??30)));
    const maxDays=Math.max(defaultDays,Math.min(3650,Number(req.body?.maxRefreshTokenDays??current.max_refresh_token_days??180)));
    const r=await db(`INSERT INTO security_api_policies(company_id,enforce_connected_app_policy,require_pkce,require_high_assurance_for_app_admin,
      default_refresh_token_days,max_refresh_token_days,allowed_grant_types,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
      ON CONFLICT(company_id) DO UPDATE SET enforce_connected_app_policy=EXCLUDED.enforce_connected_app_policy,
      require_pkce=EXCLUDED.require_pkce,require_high_assurance_for_app_admin=EXCLUDED.require_high_assurance_for_app_admin,
      default_refresh_token_days=EXCLUDED.default_refresh_token_days,max_refresh_token_days=EXCLUDED.max_refresh_token_days,
      allowed_grant_types=EXCLUDED.allowed_grant_types,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING *`,[
        req.user.companyId,req.body?.enforceConnectedAppPolicy===true,req.body?.requirePkce!==false,
        req.body?.requireHighAssuranceForAppAdmin!==false,defaultDays,maxDays,JSON.stringify(allowedGrantTypes),req.user.id
      ]);
    await audit(req,"security.api_policy_updated","security_api_policy",req.user.companyId,{});
    res.json({success:true,data:r.rows[0]});
  });

  router.get("/security/governance/trusted-origins",...manage,async(req,res)=>{
    const r=await db("SELECT * FROM security_trusted_origins WHERE company_id=$1 ORDER BY origin_type,origin",[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });

  router.post("/security/governance/trusted-origins",...manage,async(req,res)=>{
    const origin=normalizeTrustedOrigin(req.body?.origin,{allowLocalhost:process.env.NODE_ENV!=="production"});
    const type=String(req.body?.originType||"CORS").toUpperCase();
    if(!origin||!["CORS","CSP_CONNECT","REDIRECT_URI","WEBHOOK"].includes(type))return res.status(400).json({success:false,message:"A valid trusted origin and type are required"});
    const r=await db(`INSERT INTO security_trusted_origins(company_id,origin,origin_type,description,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$5)
      ON CONFLICT(company_id,origin,origin_type) DO UPDATE SET active=TRUE,description=EXCLUDED.description,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING *`,[req.user.companyId,origin,type,String(req.body?.description||"").trim()||null,req.user.id]);
    await audit(req,"security.trusted_origin_saved","security_trusted_origin",r.rows[0].id,{origin,type});
    res.status(201).json({success:true,data:r.rows[0]});
  });

  router.delete("/security/governance/trusted-origins/:id",...manage,async(req,res)=>{
    const r=await db("UPDATE security_trusted_origins SET active=FALSE,updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",[req.params.id,req.user.companyId,req.user.id]);
    if(!r.rows.length)return res.status(404).json({success:false,message:"Trusted origin not found"});
    await audit(req,"security.trusted_origin_disabled","security_trusted_origin",req.params.id,{});
    res.json({success:true});
  });

  router.get("/security/governance/connected-apps",...manage,async(req,res)=>{
    const r=await db(`SELECT COALESCE(p.id,c.id) AS id,LOWER(COALESCE(p.app_key,c.provider_name)) AS app_key,
      COALESCE(p.display_name,c.name,c.provider_name) AS display_name,c.id AS integration_connection_id,c.provider_name,c.connection_status,c.enabled AS connection_enabled,
      p.active,p.permitted_user_mode,p.allowed_scopes,p.refresh_token_days,p.ip_policy,p.require_high_assurance,p.revoke_on_policy_change,p.updated_at
      FROM integration_connections c
      FULL OUTER JOIN security_connected_app_policies p ON p.company_id=c.company_id AND (p.integration_connection_id=c.id OR (p.integration_connection_id IS NULL AND LOWER(p.app_key)=LOWER(c.provider_name)))
      WHERE COALESCE(p.company_id,c.company_id)=$1 ORDER BY display_name`,[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });

  router.put("/security/governance/connected-apps/:appKey",...manage,async(req,res)=>{
    const appKey=String(req.params.appKey||"").trim().toLowerCase();
    if(!/^[a-z0-9._:-]{2,120}$/.test(appKey))return res.status(400).json({success:false,message:"Invalid connected-app key"});
    const mode=String(req.body?.permittedUserMode||"ALL_AUTHORISED").toUpperCase();
    const ipPolicy=String(req.body?.ipPolicy||"ENFORCE").toUpperCase();
    if(!["ALL_AUTHORISED","ADMIN_APPROVED"].includes(mode)||!["ENFORCE","RELAX"].includes(ipPolicy))return res.status(400).json({success:false,message:"Invalid connected-app policy"});
    const api=await loadApiPolicy(db,req.user.companyId);
    const refreshDays=req.body?.refreshTokenDays==null?null:Number(req.body.refreshTokenDays);
    if(refreshDays!=null&&(!Number.isInteger(refreshDays)||refreshDays<1||refreshDays>Number(api.max_refresh_token_days||180)))return res.status(400).json({success:false,message:"Refresh-token lifetime exceeds policy maximum"});
    const connectionId=req.body?.integrationConnectionId||null;
    if(connectionId){
      const exists=await db("SELECT id FROM integration_connections WHERE id=$1 AND company_id=$2",[connectionId,req.user.companyId]);
      if(!exists.rows.length)return res.status(404).json({success:false,message:"Integration connection not found"});
    }
    const r=await db(`INSERT INTO security_connected_app_policies(company_id,app_key,display_name,integration_connection_id,active,permitted_user_mode,
      allowed_scopes,refresh_token_days,ip_policy,require_high_assurance,revoke_on_policy_change,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$12)
      ON CONFLICT(company_id,app_key) DO UPDATE SET display_name=EXCLUDED.display_name,integration_connection_id=EXCLUDED.integration_connection_id,
      active=EXCLUDED.active,permitted_user_mode=EXCLUDED.permitted_user_mode,allowed_scopes=EXCLUDED.allowed_scopes,
      refresh_token_days=EXCLUDED.refresh_token_days,ip_policy=EXCLUDED.ip_policy,require_high_assurance=EXCLUDED.require_high_assurance,
      revoke_on_policy_change=EXCLUDED.revoke_on_policy_change,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,[
        req.user.companyId,appKey,String(req.body?.displayName||appKey).trim(),connectionId,req.body?.active!==false,mode,
        JSON.stringify(normalizeScopes(req.body?.allowedScopes||[])),refreshDays,ipPolicy,req.body?.requireHighAssurance===true,
        req.body?.revokeOnPolicyChange!==false,req.user.id
      ]);
    await audit(req,"security.connected_app_policy_saved","security_connected_app_policy",r.rows[0].id,{appKey});
    res.json({success:true,data:r.rows[0]});
  });

  router.get("/security/governance/vault",...vaultManage,async(req,res)=>{
    const r=await db(`SELECT id,name,purpose,secret_kind,active,expires_at,rotated_at,last_accessed_at,created_at,updated_at,
      TRUE AS has_secret FROM security_vault_entries WHERE company_id=$1 ORDER BY name`,[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });

  router.post("/security/governance/vault",...vaultManage,async(req,res)=>{
    const name=String(req.body?.name||"").trim(),secret=String(req.body?.secret||"");
    if(!name||!secret)return res.status(400).json({success:false,message:"Vault entry name and secret are required"});
    const ciphertext=encryptCredentials({value:secret});
    const r=await db(`INSERT INTO security_vault_entries(company_id,name,purpose,secret_ciphertext,secret_kind,expires_at,rotated_at,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,NOW(),$7,$7)
      ON CONFLICT(company_id,name) DO UPDATE SET purpose=EXCLUDED.purpose,secret_ciphertext=EXCLUDED.secret_ciphertext,secret_kind=EXCLUDED.secret_kind,
      expires_at=EXCLUDED.expires_at,rotated_at=NOW(),active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING id,name,purpose,secret_kind,active,expires_at,rotated_at,created_at,updated_at`,[
        req.user.companyId,name,String(req.body?.purpose||"").trim()||null,ciphertext,String(req.body?.secretKind||"GENERIC").trim().toUpperCase(),
        req.body?.expiresAt||null,req.user.id
      ]);
    await audit(req,"security.vault_secret_rotated","security_vault_entry",r.rows[0].id,{name});
    res.status(201).json({success:true,data:r.rows[0]});
  });

  router.delete("/security/governance/vault/:id",...vaultManage,async(req,res)=>{
    const r=await db("UPDATE security_vault_entries SET active=FALSE,updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",[req.params.id,req.user.companyId,req.user.id]);
    if(!r.rows.length)return res.status(404).json({success:false,message:"Vault entry not found"});
    await audit(req,"security.vault_secret_disabled","security_vault_entry",req.params.id,{});
    res.json({success:true});
  });

  router.get("/security/governance/certificates",...manage,async(req,res)=>{
    const r=await db(`SELECT id,name,purpose,fingerprint_sha256,not_before,not_after,active,created_at,updated_at,
      (private_key_ciphertext IS NOT NULL) AS has_private_key FROM security_certificates WHERE company_id=$1 ORDER BY name`,[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });

  router.post("/security/governance/certificates",...manage,async(req,res)=>{
    const name=String(req.body?.name||"").trim(),pem=String(req.body?.certificatePem||"").trim();
    if(!name||!pem)return res.status(400).json({success:false,message:"Certificate name and PEM are required"});
    let meta;try{meta=certificateMetadata(pem);}catch{return res.status(400).json({success:false,message:"Certificate PEM is invalid"});}
    const privateCipher=req.body?.privateKeyPem?encryptCredentials({value:String(req.body.privateKeyPem)}):null;
    const r=await db(`INSERT INTO security_certificates(company_id,name,purpose,certificate_pem,private_key_ciphertext,fingerprint_sha256,not_before,not_after,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT(company_id,name) DO UPDATE SET purpose=EXCLUDED.purpose,certificate_pem=EXCLUDED.certificate_pem,
      private_key_ciphertext=COALESCE(EXCLUDED.private_key_ciphertext,security_certificates.private_key_ciphertext),
      fingerprint_sha256=EXCLUDED.fingerprint_sha256,not_before=EXCLUDED.not_before,not_after=EXCLUDED.not_after,active=TRUE,
      updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING id,name,purpose,fingerprint_sha256,not_before,not_after,active,(private_key_ciphertext IS NOT NULL) AS has_private_key`,[
        req.user.companyId,name,String(req.body?.purpose||"").trim()||null,pem,privateCipher,meta.fingerprintSha256,meta.notBefore,meta.notAfter,req.user.id
      ]);
    await audit(req,"security.certificate_saved","security_certificate",r.rows[0].id,{name,fingerprint:meta.fingerprintSha256});
    res.status(201).json({success:true,data:{...r.rows[0],subject:meta.subject,issuer:meta.issuer,serialNumber:meta.serialNumber}});
  });

  router.delete("/security/governance/certificates/:id",...manage,async(req,res)=>{
    const r=await db("UPDATE security_certificates SET active=FALSE,updated_by=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",[req.params.id,req.user.companyId,req.user.id]);
    if(!r.rows.length)return res.status(404).json({success:false,message:"Certificate not found"});
    await audit(req,"security.certificate_disabled","security_certificate",req.params.id,{});
    res.json({success:true});
  });

  router.get("/security/governance/health",...healthView,async(req,res)=>{
    res.json({success:true,data:await buildSecurityHealth(db,{companyId:req.user.companyId})});
  });

  router.post("/security/governance/health/:findingKey/waive",...manage,async(req,res)=>{
    const reason=String(req.body?.reason||"").trim();
    if(!reason)return res.status(400).json({success:false,message:"Waiver reason is required"});
    const r=await db(`INSERT INTO security_health_waivers(company_id,finding_key,reason,expires_at,created_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,finding_key) DO UPDATE SET reason=EXCLUDED.reason,expires_at=EXCLUDED.expires_at,created_by=EXCLUDED.created_by,created_at=NOW()
      RETURNING *`,[req.user.companyId,String(req.params.findingKey),reason,req.body?.expiresAt||null,req.user.id]);
    await audit(req,"security.health_finding_waived","security_health_waiver",r.rows[0].id,{findingKey:req.params.findingKey});
    res.json({success:true,data:r.rows[0]});
  });

  router.delete("/security/governance/health/:findingKey/waive",...manage,async(req,res)=>{
    await db("DELETE FROM security_health_waivers WHERE company_id=$1 AND finding_key=$2",[req.user.companyId,String(req.params.findingKey)]);
    await audit(req,"security.health_waiver_removed","security_health_waiver",String(req.params.findingKey),{});
    res.json({success:true});
  });

  return router;
}
