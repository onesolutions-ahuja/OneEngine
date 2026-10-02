import express from "express";
import crypto from "node:crypto";
import { gzipSync } from "node:zlib";
import { resolveTxt } from "node:dns/promises";
import { isSafeIdentifier } from "../services/platformMetadata.js";

const SENSITIVE_COLUMN=/password|secret|token|cipher|credential|private_key|auth_verifier|recovery|hash/i;

export default function createDataProtectionRouter({authenticate,authorize,db,writeAudit}){
  const router=express.Router();
  const dataManage=[authenticate,authorize("settings.manage","data.export.manage","data.retention.manage")];
  const emailManage=[authenticate,authorize("settings.manage","email.security.manage")];
  const delegatedManage=[authenticate,authorize("settings.manage","delegated_admin.manage")];
  const audit=(req,action,type,id,details={})=>writeAudit?.(req.user.companyId,req.user.id,action,type,id,details);

  async function exportSnapshot(companyId,{includeAuditLogs=true}={}){
    const tables=await db(`SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
      WHERE c.table_schema='public' AND c.column_name='company_id' AND t.table_type='BASE TABLE'
      ORDER BY c.table_name`);
    const excluded=new Set(["identity_mfa_methods","identity_pending_challenges","identity_provider_states","identity_recovery_codes","security_vault_entries","security_certificates"]);
    if(!includeAuditLogs)excluded.add("audit_logs");
    const snapshot={exportedAt:new Date().toISOString(),companyId,tables:{}};
    let total=0;
    for(const row of tables.rows){
      const table=row.table_name;
      if(excluded.has(table)||!isSafeIdentifier(table))continue;
      const columns=await db("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",[table]);
      const safeColumns=columns.rows.map(x=>x.column_name).filter(x=>isSafeIdentifier(x)&&!SENSITIVE_COLUMN.test(x));
      if(!safeColumns.length)continue;
      const result=await db(`SELECT ${safeColumns.map(x=>'"'+x+'"').join(",")} FROM "${table}" WHERE company_id=$1 LIMIT 100000`,[companyId]);
      snapshot.tables[table]=result.rows;
      total+=result.rows.length;
    }
    return {payload:gzipSync(Buffer.from(JSON.stringify(snapshot))),rowCount:total};
  }

  const generateExport=async(companyId,requestedBy=null,includeAuditLogs=true)=>{
    const built=await exportSnapshot(companyId,{includeAuditLogs});
    const r=await db(`INSERT INTO data_export_runs(company_id,requested_by,row_count,payload) VALUES($1,$2,$3,$4) RETURNING id,status,row_count,expires_at,created_at`,
      [companyId,requestedBy,built.rowCount,built.payload]);
    return r.rows[0];
  };

  const runScheduledExports=async()=>{
    try{
      const due=await db(`UPDATE data_export_settings
        SET next_run_at=CASE frequency WHEN 'WEEKLY' THEN NOW()+INTERVAL '7 days' WHEN 'MONTHLY' THEN NOW()+INTERVAL '1 month' ELSE NULL END,
            updated_at=NOW()
        WHERE enabled=TRUE AND frequency IN ('WEEKLY','MONTHLY') AND (next_run_at IS NULL OR next_run_at<=NOW())
        RETURNING company_id,include_audit_logs`);
      for(const row of due.rows){
        try{await generateExport(row.company_id,null,row.include_audit_logs!==false);}catch(error){console.error("Scheduled data export failed",row.company_id,error);}
      }
    }catch(error){console.error("Scheduled data export scan failed",error);}
  };
  const exportTimer=setInterval(()=>void runScheduledExports(),60*60*1000);
  exportTimer.unref?.();
  setTimeout(()=>void runScheduledExports(),30_000).unref?.();

  router.get("/security/data/export-settings",...dataManage,async(req,res)=>{
    const r=await db("SELECT * FROM data_export_settings WHERE company_id=$1",[req.user.companyId]);
    res.json({success:true,data:r.rows[0]||{company_id:req.user.companyId,enabled:false,frequency:"MANUAL",include_attachments:false,include_audit_logs:true}});
  });
  router.put("/security/data/export-settings",...dataManage,async(req,res)=>{
    const frequency=String(req.body?.frequency||"MANUAL").toUpperCase();
    if(!["MANUAL","WEEKLY","MONTHLY"].includes(frequency))return res.status(400).json({success:false,message:"Invalid export frequency"});
    const r=await db(`INSERT INTO data_export_settings(company_id,enabled,frequency,include_attachments,include_audit_logs,next_run_at,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(company_id) DO UPDATE SET enabled=EXCLUDED.enabled,frequency=EXCLUDED.frequency,include_attachments=EXCLUDED.include_attachments,
      include_audit_logs=EXCLUDED.include_audit_logs,next_run_at=EXCLUDED.next_run_at,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,
      [req.user.companyId,req.body?.enabled===true,frequency,req.body?.includeAttachments===true,req.body?.includeAuditLogs!==false,req.body?.nextRunAt||null,req.user.id]);
    await audit(req,"security.data_export_settings_updated","data_export_settings",req.user.companyId,{frequency});
    res.json({success:true,data:r.rows[0]});
  });
  router.post("/security/data/exports",...dataManage,async(req,res)=>{
    const settings=(await db("SELECT * FROM data_export_settings WHERE company_id=$1",[req.user.companyId])).rows[0]||{};
    const generated=await generateExport(req.user.companyId,req.user.id,settings.include_audit_logs!==false);
    await audit(req,"security.data_export_generated","data_export",generated.id,{rowCount:generated.row_count});
    res.status(201).json({success:true,data:generated});
  });
  router.get("/security/data/exports",...dataManage,async(req,res)=>{
    const r=await db("SELECT id,status,row_count,expires_at,created_at FROM data_export_runs WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50",[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });
  router.get("/security/data/exports/:id/download",...dataManage,async(req,res)=>{
    const r=await db("SELECT payload,expires_at FROM data_export_runs WHERE id=$1 AND company_id=$2 AND status='READY'",[req.params.id,req.user.companyId]);
    if(!r.rows.length||new Date(r.rows[0].expires_at)<=new Date())return res.status(404).json({success:false,message:"Export is unavailable or expired"});
    res.setHeader("Content-Type","application/gzip");
    res.setHeader("Content-Disposition",`attachment; filename="oneengine-export-${req.params.id}.json.gz"`);
    res.send(r.rows[0].payload);
  });

  router.get("/security/data/retention",...dataManage,async(req,res)=>{
    const r=await db("SELECT * FROM data_retention_policies WHERE company_id=$1 ORDER BY name",[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });
  router.post("/security/data/retention",...dataManage,async(req,res)=>{
    const name=String(req.body?.name||"").trim(),objectKey=String(req.body?.objectKey||"").trim(),action=String(req.body?.action||"DELETE").toUpperCase();
    const ageDays=Number(req.body?.ageDays),dateField=String(req.body?.dateField||"created_at");
    if(!name||!isSafeIdentifier(objectKey)||!isSafeIdentifier(dateField)||!Number.isInteger(ageDays)||ageDays<1||ageDays>36500||!["DELETE","ANONYMIZE"].includes(action))return res.status(400).json({success:false,message:"Invalid retention policy"});
    const object=(await db("SELECT id,source_table FROM platform_objects WHERE object_key=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)",[objectKey,req.user.companyId])).rows[0];
    if(!object||!isSafeIdentifier(object.source_table))return res.status(404).json({success:false,message:"Object is unavailable"});
    const fields=Array.isArray(req.body?.anonymizeFields)?req.body.anonymizeFields.map(String):[];
    if(action==="ANONYMIZE"&&!fields.length)return res.status(400).json({success:false,message:"Choose at least one field to anonymize"});
    const r=await db(`INSERT INTO data_retention_policies(company_id,name,object_key,age_days,action,date_field,anonymize_fields,enabled,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$9)
      ON CONFLICT(company_id,name) DO UPDATE SET object_key=EXCLUDED.object_key,age_days=EXCLUDED.age_days,action=EXCLUDED.action,date_field=EXCLUDED.date_field,
      anonymize_fields=EXCLUDED.anonymize_fields,enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,
      [req.user.companyId,name,objectKey,ageDays,action,dateField,JSON.stringify(fields),req.body?.enabled===true,req.user.id]);
    await audit(req,"security.retention_policy_saved","data_retention_policy",r.rows[0].id,{objectKey,action});
    res.status(201).json({success:true,data:r.rows[0]});
  });
  router.post("/security/data/retention/:id/run",...dataManage,async(req,res)=>{
    const policy=(await db("SELECT * FROM data_retention_policies WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId])).rows[0];
    if(!policy)return res.status(404).json({success:false,message:"Retention policy not found"});
    const object=(await db("SELECT id,source_table FROM platform_objects WHERE object_key=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)",[policy.object_key,req.user.companyId])).rows[0];
    if(!object||!isSafeIdentifier(object.source_table)||!isSafeIdentifier(policy.date_field))return res.status(409).json({success:false,message:"Retention object mapping is unavailable"});
    const exists=await db("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",[object.source_table,policy.date_field]);
    if(!exists.rows.length)return res.status(409).json({success:false,message:"Retention date field is unavailable"});
    let result;
    if(policy.action==="DELETE"){
      result=await db(`DELETE FROM "${object.source_table}" WHERE company_id=$1 AND "${policy.date_field}" < NOW()-($2*INTERVAL '1 day') RETURNING id`,[req.user.companyId,policy.age_days]);
    }else{
      const names=Array.isArray(policy.anonymize_fields)?policy.anonymize_fields:[];
      const fields=await db("SELECT api_name,source_column FROM platform_fields WHERE object_id=$1 AND active=TRUE AND api_name=ANY($2::text[])",[object.id,names]);
      const cols=fields.rows.map(f=>f.source_column).filter(x=>isSafeIdentifier(x)&&!SENSITIVE_COLUMN.test(x));
      if(!cols.length)return res.status(409).json({success:false,message:"No safe mapped fields are available to anonymize"});
      result=await db(`UPDATE "${object.source_table}" SET ${cols.map(c=>'"'+c+'"=NULL').join(",")} WHERE company_id=$1 AND "${policy.date_field}" < NOW()-($2*INTERVAL '1 day') RETURNING id`,[req.user.companyId,policy.age_days]);
    }
    await audit(req,"security.retention_policy_run","data_retention_policy",policy.id,{affected:result.rowCount||result.rows.length,action:policy.action});
    res.json({success:true,data:{affected:result.rowCount||result.rows.length,action:policy.action}});
  });

  router.get("/security/email/settings",...emailManage,async(req,res)=>{
    const [d,domains,addresses,roles]=await Promise.all([
      db("SELECT * FROM email_deliverability_settings WHERE company_id=$1",[req.user.companyId]),
      db("SELECT * FROM email_sending_domains WHERE company_id=$1 ORDER BY domain",[req.user.companyId]),
      db("SELECT * FROM organization_email_addresses WHERE company_id=$1 ORDER BY email",[req.user.companyId]),
      db("SELECT id,name FROM roles WHERE company_id=$1 ORDER BY name",[req.user.companyId]),
    ]);
    res.json({success:true,data:{deliverability:d.rows[0]||{access_level:"ALL_EMAIL",require_verified_sender:true,use_substitute_for_unverified:false},domains:domains.rows,addresses:addresses.rows,roles:roles.rows}});
  });
  router.put("/security/email/deliverability",...emailManage,async(req,res)=>{
    const level=String(req.body?.accessLevel||"ALL_EMAIL").toUpperCase();
    if(!["NO_EMAIL","SYSTEM_ONLY","ALL_EMAIL"].includes(level))return res.status(400).json({success:false,message:"Invalid deliverability level"});
    const noReply=req.body?.noReplyAddressId||null;
    if(noReply&&!(await db("SELECT 1 FROM organization_email_addresses WHERE id=$1 AND company_id=$2 AND active=TRUE",[noReply,req.user.companyId])).rows.length)return res.status(400).json({success:false,message:"No-reply address is unavailable"});
    const r=await db(`INSERT INTO email_deliverability_settings(company_id,access_level,require_verified_sender,use_substitute_for_unverified,no_reply_address_id,updated_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id) DO UPDATE SET access_level=EXCLUDED.access_level,require_verified_sender=EXCLUDED.require_verified_sender,
      use_substitute_for_unverified=EXCLUDED.use_substitute_for_unverified,no_reply_address_id=EXCLUDED.no_reply_address_id,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,
      [req.user.companyId,level,req.body?.requireVerifiedSender!==false,req.body?.useSubstituteForUnverified===true,noReply,req.user.id]);
    await audit(req,"security.email_deliverability_updated","email_deliverability",req.user.companyId,{level});
    res.json({success:true,data:r.rows[0]});
  });
  router.post("/security/email/domains",...emailManage,async(req,res)=>{
    const domain=String(req.body?.domain||"").trim().toLowerCase().replace(/^@/,"");
    if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))return res.status(400).json({success:false,message:"Valid email domain required"});
    const token=crypto.randomBytes(24).toString("base64url");
    const r=await db(`INSERT INTO email_sending_domains(company_id,domain,dns_verification_token,created_by) VALUES($1,$2,$3,$4)
      ON CONFLICT(company_id,domain) DO UPDATE SET dns_verification_token=EXCLUDED.dns_verification_token,status='PENDING',updated_at=NOW() RETURNING *`,
      [req.user.companyId,domain,token,req.user.id]);
    res.status(201).json({success:true,data:{...r.rows[0],verificationHost:`_oneengine-verification.${domain}`,verificationValue:token}});
  });
  router.post("/security/email/domains/:id/verify",...emailManage,async(req,res)=>{
    const domain=(await db("SELECT * FROM email_sending_domains WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId])).rows[0];
    if(!domain)return res.status(404).json({success:false,message:"Email domain not found"});
    let verified=false;
    try{
      const records=await resolveTxt(`_oneengine-verification.${domain.domain}`);
      verified=records.flat().some(value=>String(value).includes(domain.dns_verification_token));
    }catch{}
    const r=await db("UPDATE email_sending_domains SET status=$1,verified_at=CASE WHEN $1='VERIFIED' THEN NOW() ELSE verified_at END,updated_at=NOW() WHERE id=$2 RETURNING *",[verified?"VERIFIED":"FAILED",domain.id]);
    if(verified)await db("UPDATE organization_email_addresses SET verified=TRUE,updated_at=NOW() WHERE company_id=$1 AND LOWER(split_part(email,'@',2))=$2",[req.user.companyId,domain.domain]);
    res.status(verified?200:409).json({success:verified,data:r.rows[0],message:verified?"Domain verified":"DNS verification record was not found"});
  });
  router.post("/security/email/addresses",...emailManage,async(req,res)=>{
    const email=String(req.body?.email||"").trim().toLowerCase(),purpose=String(req.body?.purpose||"GENERAL").toUpperCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!["GENERAL","NO_REPLY","SUPPORT","BILLING","MARKETING"].includes(purpose))return res.status(400).json({success:false,message:"Valid organization email and purpose are required"});
    const domain=email.split("@")[1];
    const verified=(await db("SELECT 1 FROM email_sending_domains WHERE company_id=$1 AND domain=$2 AND status='VERIFIED'",[req.user.companyId,domain])).rows.length>0;
    const r=await db(`INSERT INTO organization_email_addresses(company_id,email,display_name,purpose,verified,allow_all_users,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(company_id,email) DO UPDATE SET display_name=EXCLUDED.display_name,purpose=EXCLUDED.purpose,
      verified=EXCLUDED.verified,allow_all_users=EXCLUDED.allow_all_users,active=TRUE,updated_at=NOW() RETURNING *`,
      [req.user.companyId,email,String(req.body?.displayName||"").trim()||null,purpose,verified,req.body?.allowAllUsers===true,req.user.id]);
    res.status(201).json({success:true,data:r.rows[0]});
  });
  router.put("/security/email/addresses/:id/roles",...emailManage,async(req,res)=>{
    const address=(await db("SELECT id FROM organization_email_addresses WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId])).rows[0];
    if(!address)return res.status(404).json({success:false,message:"Organization email address not found"});
    const roleIds=[...new Set((Array.isArray(req.body?.roleIds)?req.body.roleIds:[]).map(String))];
    if(roleIds.length){
      const valid=await db("SELECT id FROM roles WHERE company_id=$1 AND id=ANY($2::uuid[])",[req.user.companyId,roleIds]);
      if(valid.rows.length!==roleIds.length)return res.status(400).json({success:false,message:"One or more roles are invalid"});
    }
    await db("DELETE FROM organization_email_role_access WHERE email_address_id=$1 AND company_id=$2",[address.id,req.user.companyId]);
    if(roleIds.length)await db("INSERT INTO organization_email_role_access(email_address_id,role_id,company_id) SELECT $1,unnest($2::uuid[]),$3",[address.id,roleIds,req.user.companyId]);
    res.json({success:true});
  });

  router.get("/security/delegated-admin",...delegatedManage,async(req,res)=>{
    const [groups,users,roles]=await Promise.all([
      db(`SELECT g.*,
        ARRAY(SELECT user_id FROM delegated_admin_members m WHERE m.group_id=g.id) AS member_ids,
        ARRAY(SELECT role_id FROM delegated_admin_role_scopes s WHERE s.group_id=g.id) AS scope_role_ids,
        ARRAY(SELECT role_id FROM delegated_admin_assignable_roles a WHERE a.group_id=g.id) AS assignable_role_ids
        FROM delegated_admin_groups g WHERE g.company_id=$1 ORDER BY g.name`,[req.user.companyId]),
      db("SELECT id,username,full_name,email FROM users WHERE company_id=$1 AND active=TRUE ORDER BY full_name,username",[req.user.companyId]),
      db("SELECT id,name,parent_role_id FROM roles WHERE company_id=$1 ORDER BY name",[req.user.companyId]),
    ]);
    res.json({success:true,data:{groups:groups.rows,users:users.rows,roles:roles.rows}});
  });
  router.post("/security/delegated-admin",...delegatedManage,async(req,res)=>{
    const name=String(req.body?.name||"").trim();
    if(!name)return res.status(400).json({success:false,message:"Delegated group name is required"});
    const memberIds=[...new Set((req.body?.memberIds||[]).map(String))],scopeRoleIds=[...new Set((req.body?.scopeRoleIds||[]).map(String))],assignableRoleIds=[...new Set((req.body?.assignableRoleIds||[]).map(String))];
    const r=await db(`INSERT INTO delegated_admin_groups(company_id,name,description,allow_login_access,active,created_by)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(company_id,name) DO UPDATE SET description=EXCLUDED.description,allow_login_access=EXCLUDED.allow_login_access,
      active=EXCLUDED.active,updated_at=NOW() RETURNING *`,[req.user.companyId,name,String(req.body?.description||"").trim()||null,req.body?.allowLoginAccess===true,req.body?.active!==false,req.user.id]);
    const group=r.rows[0];
    await db("DELETE FROM delegated_admin_members WHERE group_id=$1 AND company_id=$2",[group.id,req.user.companyId]);
    await db("DELETE FROM delegated_admin_role_scopes WHERE group_id=$1 AND company_id=$2",[group.id,req.user.companyId]);
    await db("DELETE FROM delegated_admin_assignable_roles WHERE group_id=$1 AND company_id=$2",[group.id,req.user.companyId]);
    if(memberIds.length)await db("INSERT INTO delegated_admin_members(group_id,user_id,company_id) SELECT $1,unnest($2::uuid[]),$3",[group.id,memberIds,req.user.companyId]);
    if(scopeRoleIds.length)await db("INSERT INTO delegated_admin_role_scopes(group_id,role_id,company_id) SELECT $1,unnest($2::uuid[]),$3",[group.id,scopeRoleIds,req.user.companyId]);
    if(assignableRoleIds.length)await db("INSERT INTO delegated_admin_assignable_roles(group_id,role_id,company_id) SELECT $1,unnest($2::uuid[]),$3",[group.id,assignableRoleIds,req.user.companyId]);
    await audit(req,"security.delegated_admin_saved","delegated_admin_group",group.id,{name});
    res.status(201).json({success:true,data:group});
  });

  return router;
}
