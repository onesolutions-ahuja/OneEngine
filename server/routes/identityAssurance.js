import express from "express";
import crypto from "node:crypto";
import {
  activeTemporaryVerificationCode, assuranceSatisfies, consumeChallenge, consumeRecoveryCode, createPendingChallenge,
  effectiveStepUpPolicy, findTrustedDevice, generateTemporaryVerificationCode, getPendingChallenge, listMfaMethods,
  loadEffectiveAssurance, mfaMethodAllowed, newDeviceToken, replaceRecoveryCodes, startTotpEnrollment,
  stepUpRequired, trustDevice, verifyTemporaryVerificationCode, verifyTotpMethod,
} from "../services/identityAssurance.js";
import { clientIp, createTrackedSession, writeLoginHistory } from "../services/identitySecurity.js";

function publicMethod(row){
  return {id:row.id,type:row.method_type,label:row.label||row.method_type,authenticatorKind:row.authenticator_kind||null,phishingResistant:row.phishing_resistant===true,lastUsedAt:row.last_used_at||null};
}
function safeProvider(row){
  const cfg=row?.configuration&&typeof row.configuration==="object"?row.configuration:{};
  return {
    id:row.id,name:row.name,providerKey:row.provider_key,providerType:row.provider_type,
    enabled:row.enabled===true,showOnLogin:row.show_on_login!==false,useOneEngineMfa:row.use_oneengine_mfa===true,
    assuranceLevel:row.assurance_level||"STANDARD",configuration:cfg,hasCredentials:Boolean(row.credentials_encrypted),
  };
}
function base64urlBuffer(value){return Buffer.from(String(value||""),"base64url");}
function methodAssurance(method,effective){
  if(method?.method_type==="PASSKEY")return effective?.passkeyAssurance||"HIGH";
  if(method?.method_type==="TOTP")return effective?.totpAssurance||"STANDARD";
  return "STANDARD";
}

export default function createIdentityAssuranceRouter({authenticate,authorize,db,createToken,encryptCredentials,decryptCredentials,writeAudit}) {
  const router=express.Router();
  const manage=[authenticate,authorize("settings.manage")];

  async function finishChallenge(req,res,{challenge,user,assuranceLevel="HIGH",mfaMethod="MFA",trust=false,deviceName=null,extra={}}){
    const consumed=await consumeChallenge(db,challenge.id);
    if(!consumed)return res.status(400).json({success:false,code:"MFA_CHALLENGE_EXPIRED",message:"Verification challenge has expired"});
    const policy=await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id});
    const deviceToken=trust&&policy.effective.trustedDeviceDays>0?newDeviceToken():null;
    const device=deviceToken?await trustDevice(db,{
      companyId:user.company_id,userId:user.id,token:deviceToken,name:deviceName,days:policy.effective.trustedDeviceDays,ip:clientIp(req),req
    }):null;
    const sessionId=await createTrackedSession(db,{
      user,ip:clientIp(req),userAgent:req.get("user-agent")||null,authMethod:challenge.context?.authMethod||"PASSWORD",
      settings:policy.settings,originHost:String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").split(",")[0].trim().toLowerCase()||null,
    });
    await db(`UPDATE identity_sessions SET assurance_level=$2,assurance_verified_at=NOW(),mfa_method=$3,trusted_device_id=$4 WHERE id=$1`,
      [sessionId,assuranceLevel,mfaMethod,device?.id||null]);
    user.session_id=sessionId;
    const token=createToken(user);
    await writeLoginHistory(db,{user,identifier:user.email||user.username,status:"SUCCESS",reason:"MFA_VERIFIED",ip:clientIp(req),userAgent:req.get("user-agent")||null,authMethod:challenge.context?.authMethod||"PASSWORD",sessionId,req});
    res.json({success:true,token,deviceToken,...extra,user:{
      id:user.id,username:user.username,name:user.full_name,role:user.role_name,defaultLandingPage:user.default_landing_page||"dashboard",
      companyId:user.company_id,storeId:user.store_id,mustChangePassword:user.must_change_password===true,
    }});
  }

  async function pendingUser(challengeId,types=["LOGIN","STEP_UP","PASSKEY_REGISTRATION","PASSKEY_AUTHENTICATION"]){
    const challenge=await getPendingChallenge(db,challengeId,{types});
    if(!challenge)return {challenge:null,user:null};
    const r=await db(`SELECT u.*,r.name role_name,COALESCE(r.default_landing_page,'dashboard') default_landing_page
      FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND u.company_id=$2 AND u.active=TRUE LIMIT 1`,[challenge.user_id,challenge.company_id]);
    return {challenge,user:r.rows[0]||null};
  }

  router.post("/auth/step-up/start",authenticate,async(req,res)=>{
    const resourceKey=String(req.body?.resourceKey||"").trim().toUpperCase();
    if(!resourceKey)return res.status(400).json({success:false,message:"resourceKey is required"});
    const policy=await effectiveStepUpPolicy(db,{companyId:req.user.companyId,resourceKey});
    if(!policy||policy.action==="ALLOW")return res.json({success:true,required:false,assuranceLevel:req.authSession?.assurance_level||"STANDARD"});
    if(policy.action==="BLOCK")return res.status(403).json({success:false,code:"RESOURCE_BLOCKED",message:"This operation is blocked by security policy"});
    if(!stepUpRequired({session:req.authSession,policy,defaultMinutes:15}))return res.json({success:true,required:false,assuranceLevel:req.authSession?.assurance_level||"HIGH"});
    const assurance=await loadEffectiveAssurance(db,{companyId:req.user.companyId,userId:req.user.id,roleId:req.user.roleId});
    const methods=(await listMfaMethods(db,{companyId:req.user.companyId,userId:req.user.id}))
      .filter((method)=>mfaMethodAllowed(method,assurance.effective))
      .filter((method)=>assuranceSatisfies(methodAssurance(method,assurance.effective),policy.required_assurance||"HIGH"));
    const challenge=await createPendingChallenge(db,{companyId:req.user.companyId,userId:req.user.id,type:"STEP_UP",
      context:{sessionId:req.user.sid,resourceKey},minutes:10});
    res.status(202).json({success:true,required:true,challengeId:challenge.id,availableMethods:methods.map(publicMethod),
      enrollmentRequired:methods.length===0,requiredAssurance:policy.required_assurance||"HIGH"});
  });

  router.get("/security/assurance",...manage,async(req,res)=>{
    const [settings,providers,stepUps]=await Promise.all([
      db("SELECT * FROM identity_security_settings WHERE company_id=$1",[req.user.companyId]),
      db("SELECT * FROM identity_auth_providers WHERE company_id=$1 ORDER BY name",[req.user.companyId]),
      db("SELECT * FROM identity_step_up_policies WHERE company_id=$1 ORDER BY resource_key",[req.user.companyId]),
    ]);
    res.json({success:true,data:{settings:settings.rows[0]||{},providers:providers.rows.map(safeProvider),stepUpPolicies:stepUps.rows}});
  });

  router.put("/security/assurance",...manage,async(req,res)=>{
    const b=req.body||{};
    const current=(await db("SELECT * FROM identity_security_settings WHERE company_id=$1",[req.user.companyId])).rows[0]||{};
    const reqLevel=["STANDARD","HIGH"].includes(String(b.requiredLoginAssurance||current.required_login_assurance).toUpperCase())?String(b.requiredLoginAssurance||current.required_login_assurance).toUpperCase():"STANDARD";
    const level=(key,currentKey)=>["STANDARD","HIGH"].includes(String(b[key]||current[currentKey]).toUpperCase())?String(b[key]||current[currentKey]).toUpperCase():current[currentKey];
    const values={
      mfaRequired:b.mfaRequired===undefined?current.mfa_required:b.mfaRequired===true,
      phishingResistant:b.phishingResistantMfaRequired===undefined?current.phishing_resistant_mfa_required:b.phishingResistantMfaRequired===true,
      trustSsoMfa:b.trustSsoMfa===undefined?current.trust_sso_mfa:b.trustSsoMfa===true,
      trustedDeviceDays:Math.min(3650,Math.max(0,Number(b.trustedDeviceDays??current.trusted_device_days??30))),
      deviceActivationRequired:b.deviceActivationRequired===undefined?current.device_activation_required:b.deviceActivationRequired===true,
      skipDeviceActivationOnTrustedNetwork:b.skipDeviceActivationOnTrustedNetwork===undefined?current.skip_device_activation_on_trusted_network:b.skipDeviceActivationOnTrustedNetwork!==false,
      stepUpPeriodMinutes:Math.min(1440,Math.max(1,Number(b.stepUpPeriodMinutes??current.step_up_period_minutes??15))),
      requiredLoginAssurance:reqLevel,
      passwordAssurance:level("passwordAssurance","password_assurance"),
      totpAssurance:level("totpAssurance","totp_assurance"),
      passkeyAssurance:level("passkeyAssurance","passkey_assurance"),
      ssoAssurance:level("ssoAssurance","sso_assurance"),
      allowTotp:b.allowTotp===undefined?current.allow_totp:b.allowTotp!==false,
      allowPlatformPasskeys:b.allowPlatformPasskeys===undefined?current.allow_platform_passkeys:b.allowPlatformPasskeys!==false,
      allowSecurityKeys:b.allowSecurityKeys===undefined?current.allow_security_keys:b.allowSecurityKeys!==false,
      allowRecoveryCodes:b.allowRecoveryCodes===undefined?current.allow_recovery_codes:b.allowRecoveryCodes!==false,
    };
    if(values.phishingResistant && values.passkeyAssurance!=="HIGH")return res.status(400).json({success:false,message:"Passkey authentication must be High Assurance when phishing-resistant MFA is required."});
    const r=await db(`UPDATE identity_security_settings SET mfa_required=$1,phishing_resistant_mfa_required=$2,trust_sso_mfa=$3,
      trusted_device_days=$4,device_activation_required=$5,skip_device_activation_on_trusted_network=$6,
      step_up_period_minutes=$7,required_login_assurance=$8,password_assurance=$9,totp_assurance=$10,
      passkey_assurance=$11,sso_assurance=$12,allow_totp=$13,allow_platform_passkeys=$14,allow_security_keys=$15,allow_recovery_codes=$16,
      updated_by=$17,updated_at=NOW() WHERE company_id=$18 RETURNING *`,
      [values.mfaRequired,values.phishingResistant,values.trustSsoMfa,values.trustedDeviceDays,values.deviceActivationRequired,values.skipDeviceActivationOnTrustedNetwork,
       values.stepUpPeriodMinutes,values.requiredLoginAssurance,values.passwordAssurance,values.totpAssurance,values.passkeyAssurance,values.ssoAssurance,
       values.allowTotp,values.allowPlatformPasskeys,values.allowSecurityKeys,values.allowRecoveryCodes,req.user.id,req.user.companyId]);
    await writeAudit?.(req.user.companyId,req.user.id,"security.assurance_updated","identity_security_settings",req.user.companyId,values);
    res.json({success:true,data:r.rows[0]});
  });

  router.get("/auth/mfa/methods",authenticate,async(req,res)=>{
    res.json({success:true,data:(await listMfaMethods(db,{companyId:req.user.companyId,userId:req.user.id})).map(publicMethod)});
  });

  router.get("/auth/mfa/challenge/:id",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.params.id,["LOGIN","STEP_UP"]);
    if(!challenge||!user)return res.status(404).json({success:false,message:"Verification challenge is invalid or expired"});
    const policy=await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id});
    const methods=await listMfaMethods(db,{companyId:user.company_id,userId:user.id});
    const usable=methods.filter((method)=>mfaMethodAllowed(method,policy.effective))
      .filter((method)=>!policy.effective.phishingResistantRequired||method.phishing_resistant===true);
    const temporaryCode=!challenge.context?.activationOnly&&!policy.effective.phishingResistantRequired
      ? await activeTemporaryVerificationCode(db,{companyId:user.company_id,userId:user.id}) : null;
    const availableMethods=[
      ...usable.map(publicMethod),
      ...(temporaryCode?[{id:temporaryCode.id,type:"TEMPORARY_CODE",label:"Temporary Verification Code",phishingResistant:false,expiresAt:temporaryCode.expires_at}]:[]),
    ];
    res.json({success:true,data:{
      challengeId:challenge.id,
      challengeType:challenge.challenge_type,
      enrollmentRequired:usable.length===0 && !temporaryCode,
      phishingResistantRequired:policy.effective.phishingResistantRequired===true,
      availableMethods,
      allowedEnrollmentMethods:[
        ...(!policy.effective.phishingResistantRequired&&policy.effective.allowTotp?["TOTP"]:[]),
        ...(policy.effective.allowPlatformPasskeys?["PLATFORM_PASSKEY"]:[]),
        ...(policy.effective.allowSecurityKeys?["SECURITY_KEY"]:[]),
      ],
      user:{id:user.id,name:user.full_name,username:user.username},
    }});
  });

  router.post("/auth/mfa/totp/start",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.body?.challengeId,["LOGIN"]);
    if(!challenge||!user)return res.status(400).json({success:false,message:"Login verification challenge is invalid or expired"});
    const policy=await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id});
    if(!policy.effective.allowTotp)return res.status(403).json({success:false,code:"MFA_METHOD_DISABLED",message:"Authenticator apps are disabled by security policy"});
    const enrolled=await listMfaMethods(db,{companyId:user.company_id,userId:user.id});
    if(enrolled.some((method)=>method.method_type==="TOTP"))return res.status(409).json({success:false,message:"An authenticator app is already enrolled."});
    const method=await startTotpEnrollment(db,{companyId:user.company_id,userId:user.id,email:user.email||user.username,label:req.body?.label||"Authenticator"});
    res.json({success:true,data:method});
  });

  router.post("/auth/mfa/totp/complete",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.body?.challengeId,["LOGIN"]);
    if(!challenge||!user)return res.status(400).json({success:false,message:"Login verification challenge is invalid or expired"});
    const ok=await verifyTotpMethod(db,{companyId:user.company_id,userId:user.id,methodId:req.body?.methodId,code:req.body?.code,markVerified:true});
    if(!ok)return res.status(401).json({success:false,code:"MFA_INVALID",message:"Verification code is incorrect"});
    const recoveryCodes=await replaceRecoveryCodes(db,{companyId:user.company_id,userId:user.id});
    const assurance=(await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id})).effective.totpAssurance;
    return finishChallenge(req,res,{challenge,user,assuranceLevel:assurance,mfaMethod:"TOTP",trust:req.body?.trustDevice===true,deviceName:req.body?.deviceName,extra:{recoveryCodes}});
  });

  router.post("/auth/mfa/verify",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.body?.challengeId,["LOGIN","STEP_UP"]);
    if(!challenge||!user)return res.status(400).json({success:false,message:"Verification challenge is invalid or expired"});
    const methodType=String(req.body?.methodType||"TOTP").toUpperCase();
    let ok=false,assurance="HIGH";
    if(methodType==="TOTP"){
      ok=await verifyTotpMethod(db,{companyId:user.company_id,userId:user.id,methodId:req.body?.methodId,code:req.body?.code});
      assurance=(await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id})).effective.totpAssurance;
    }else if(methodType==="RECOVERY_CODE"){
      const policy=await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id});
      if(policy.effective.allowRecoveryCodes)ok=await consumeRecoveryCode(db,{companyId:user.company_id,userId:user.id,code:req.body?.code});
      assurance="STANDARD";
    }else if(methodType==="TEMPORARY_CODE"){
      if(challenge.context?.activationOnly)return res.status(403).json({success:false,code:"TEMP_CODE_NOT_VALID_FOR_DEVICE_ACTIVATION",message:"Temporary verification codes can satisfy MFA but cannot activate a new device"});
      ok=await verifyTemporaryVerificationCode(db,{companyId:user.company_id,userId:user.id,code:req.body?.code});
      assurance="STANDARD";
    }
    if(!ok)return res.status(401).json({success:false,code:"MFA_INVALID",message:"Verification code is incorrect"});
    if(challenge.challenge_type==="STEP_UP"){
      const sid=challenge.context?.sessionId;
      if(!sid)return res.status(400).json({success:false,message:"Step-up session is missing"});
      await consumeChallenge(db,challenge.id);
      await db("UPDATE identity_sessions SET assurance_level=$2,assurance_verified_at=NOW(),mfa_method=$3 WHERE id=$1 AND user_id=$4",[sid,assurance,methodType,user.id]);
      return res.json({success:true,assuranceLevel:assurance});
    }
    return finishChallenge(req,res,{challenge,user,assuranceLevel:assurance,mfaMethod:methodType,trust:req.body?.trustDevice===true,deviceName:req.body?.deviceName});
  });

  router.post("/auth/mfa/passkey/registration-options",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.body?.challengeId,["LOGIN"]);
    if(!challenge||!user)return res.status(400).json({success:false,message:"Login verification challenge is invalid or expired"});
    const policy=await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id});
    const kind=String(req.body?.authenticatorKind||"PLATFORM").toUpperCase()==="SECURITY_KEY"?"SECURITY_KEY":"PLATFORM";
    if(kind==="PLATFORM"&&!policy.effective.allowPlatformPasskeys)return res.status(403).json({success:false,code:"MFA_METHOD_DISABLED",message:"Built-in passkeys are disabled by security policy"});
    if(kind==="SECURITY_KEY"&&!policy.effective.allowSecurityKeys)return res.status(403).json({success:false,code:"MFA_METHOD_DISABLED",message:"Physical security keys are disabled by security policy"});
    const {generateRegistrationOptions}=await import("@simplewebauthn/server");
    const existing=(await listMfaMethods(db,{companyId:user.company_id,userId:user.id,includeUnverified:true})).filter(x=>x.method_type==="PASSKEY"&&x.credential_id);
    const rpID=String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").split(":")[0].split(",")[0].trim();
    const options=await generateRegistrationOptions({
      rpName:"OneEngine",rpID,userName:user.email||user.username,userDisplayName:user.full_name||user.username,
      userID:new TextEncoder().encode(user.id),
      attestationType:"none",authenticatorSelection:{authenticatorAttachment:kind==="PLATFORM"?"platform":"cross-platform",residentKey:"preferred",userVerification:"preferred"},
      excludeCredentials:existing.map(x=>({id:x.credential_id,transports:Array.isArray(x.transports)?x.transports:[]})),
    });
    await db("UPDATE identity_mfa_challenges SET challenge=$2,context=context||$3::jsonb WHERE id=$1",[challenge.id,options.challenge,JSON.stringify({rpID,authenticatorKind:kind})]);
    res.json({success:true,data:options});
  });

  router.post("/auth/mfa/passkey/registration-verify",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.body?.challengeId,["LOGIN"]);
    if(!challenge||!user)return res.status(400).json({success:false,message:"Login verification challenge is invalid or expired"});
    const {verifyRegistrationResponse}=await import("@simplewebauthn/server");
    const rpID=challenge.context?.rpID||String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").split(":")[0];
    const origin=String(req.headers?.origin||`https://${rpID}`);
    let verification;
    try{verification=await verifyRegistrationResponse({response:req.body?.credential,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:false});}
    catch(error){return res.status(401).json({success:false,code:"PASSKEY_INVALID",message:"Passkey verification failed"});}
    if(!verification.verified||!verification.registrationInfo)return res.status(401).json({success:false,message:"Passkey could not be verified"});
    const info=verification.registrationInfo;
    const cred=info.credential;
    const id=cred?.id||req.body?.credential?.id;
    const publicKey=Buffer.from(cred.publicKey).toString("base64url");
    await db(`INSERT INTO identity_mfa_methods(company_id,user_id,method_type,label,credential_id,public_key,sign_count,transports,aaguid,discoverable,authenticator_kind,phishing_resistant,verified)
      VALUES($1,$2,'PASSKEY',$3,$4,$5,$6,$7::jsonb,$8,$9,$10,TRUE,TRUE)
      ON CONFLICT(user_id,method_type,label) DO UPDATE SET credential_id=EXCLUDED.credential_id,public_key=EXCLUDED.public_key,
       sign_count=EXCLUDED.sign_count,transports=EXCLUDED.transports,aaguid=EXCLUDED.aaguid,discoverable=EXCLUDED.discoverable,
       authenticator_kind=EXCLUDED.authenticator_kind,verified=TRUE,active=TRUE`,
      [user.company_id,user.id,String(req.body?.label||(challenge.context?.authenticatorKind==="SECURITY_KEY"?"Security Key":"Built-in Passkey")),id,publicKey,Number(cred.counter||0),JSON.stringify(cred.transports||[]),info.aaguid||null,info.credentialDeviceType==="multiDevice",challenge.context?.authenticatorKind||"PLATFORM"]);
    const recoveryCodes=await replaceRecoveryCodes(db,{companyId:user.company_id,userId:user.id});
    const assurance=(await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id})).effective.passkeyAssurance;
    return finishChallenge(req,res,{challenge,user,assuranceLevel:assurance,mfaMethod:"PASSKEY",trust:req.body?.trustDevice===true,deviceName:req.body?.deviceName,extra:{recoveryCodes}});
  });

  router.post("/auth/mfa/passkey/options",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.body?.challengeId,["LOGIN","STEP_UP"]);
    if(!challenge||!user)return res.status(400).json({success:false,message:"Verification challenge is invalid or expired"});
    const policy=await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id});
    const methods=(await listMfaMethods(db,{companyId:user.company_id,userId:user.id}))
      .filter(x=>x.method_type==="PASSKEY"&&mfaMethodAllowed(x,policy.effective));
    if(!methods.length)return res.status(409).json({success:false,message:"No passkey is enrolled"});
    const {generateAuthenticationOptions}=await import("@simplewebauthn/server");
    const rpID=String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").split(":")[0].split(",")[0].trim();
    const options=await generateAuthenticationOptions({rpID,userVerification:"preferred",allowCredentials:methods.map(x=>({id:x.credential_id,transports:Array.isArray(x.transports)?x.transports:[]}))});
    await db("UPDATE identity_mfa_challenges SET challenge=$2,context=context||$3::jsonb WHERE id=$1",[challenge.id,options.challenge,JSON.stringify({rpID})]);
    res.json({success:true,data:options});
  });

  router.post("/auth/mfa/passkey/verify",async(req,res)=>{
    const {challenge,user}=await pendingUser(req.body?.challengeId,["LOGIN","STEP_UP"]);
    if(!challenge||!user)return res.status(400).json({success:false,message:"Verification challenge is invalid or expired"});
    const credId=String(req.body?.credential?.id||"");
    const r=await db("SELECT * FROM identity_mfa_methods WHERE company_id=$1 AND user_id=$2 AND method_type='PASSKEY' AND credential_id=$3 AND active=TRUE AND verified=TRUE LIMIT 1",[user.company_id,user.id,credId]);
    const method=r.rows[0];if(!method)return res.status(401).json({success:false,message:"Passkey is not registered"});
    const {verifyAuthenticationResponse}=await import("@simplewebauthn/server");
    const rpID=challenge.context?.rpID||String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").split(":")[0];
    const origin=String(req.headers?.origin||`https://${rpID}`);
    let verification;
    try{verification=await verifyAuthenticationResponse({
      response:req.body?.credential,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:false,
      credential:{id:method.credential_id,publicKey:base64urlBuffer(method.public_key),counter:Number(method.sign_count||0),transports:Array.isArray(method.transports)?method.transports:[]},
    });}catch(error){return res.status(401).json({success:false,code:"PASSKEY_INVALID",message:"Passkey verification failed"});}
    if(!verification.verified)return res.status(401).json({success:false,message:"Passkey verification failed"});
    await db("UPDATE identity_mfa_methods SET sign_count=$2,last_used_at=NOW() WHERE id=$1",[method.id,verification.authenticationInfo?.newCounter||method.sign_count]);
    if(challenge.challenge_type==="STEP_UP"){
      await consumeChallenge(db,challenge.id);
      await db("UPDATE identity_sessions SET assurance_level='HIGH',assurance_verified_at=NOW(),mfa_method='PASSKEY' WHERE id=$1 AND user_id=$2",[challenge.context?.sessionId,user.id]);
      return res.json({success:true,assuranceLevel:"HIGH"});
    }
    return finishChallenge(req,res,{challenge,user,assuranceLevel:"HIGH",mfaMethod:"PASSKEY",trust:req.body?.trustDevice===true,deviceName:req.body?.deviceName});
  });

  router.get("/security/mfa/users",...manage,async(req,res)=>{
    const r=await db(`SELECT u.id,u.username,u.full_name,u.email,
      COUNT(m.id) FILTER (WHERE m.active=TRUE AND m.verified=TRUE)::int AS method_count,
      COALESCE(jsonb_agg(DISTINCT m.method_type) FILTER (WHERE m.active=TRUE AND m.verified=TRUE),'[]'::jsonb) AS method_types
      FROM users u LEFT JOIN identity_mfa_methods m ON m.user_id=u.id AND m.company_id=u.company_id
      WHERE u.company_id=$1 GROUP BY u.id ORDER BY u.full_name,u.username`,[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });

  router.get("/security/mfa/users/:userId/methods",...manage,async(req,res)=>{
    const [r,temp]=await Promise.all([
      db(`SELECT id,method_type,label,authenticator_kind,phishing_resistant,verified,active,created_at,last_used_at
        FROM identity_mfa_methods WHERE company_id=$1 AND user_id=$2 ORDER BY created_at`,[req.user.companyId,req.params.userId]),
      activeTemporaryVerificationCode(db,{companyId:req.user.companyId,userId:req.params.userId}),
    ]);
    const rows=[...r.rows];
    if(temp)rows.push({id:temp.id,method_type:"TEMPORARY_CODE",label:"Temporary Verification Code",active:true,verified:true,expires_at:temp.expires_at,created_at:temp.generated_at});
    res.json({success:true,data:rows});
  });

  router.post("/security/mfa/users/:userId/temporary-code",...manage,async(req,res)=>{
    if(!req.authSession||!assuranceSatisfies(req.authSession.assurance_level,"HIGH")){
      return res.status(428).json({success:false,code:"STEP_UP_REQUIRED",resourceKey:"USER_ADMIN",message:"High-Assurance verification is required to generate a temporary MFA code"});
    }
    const user=(await db("SELECT id,role_id,active FROM users WHERE id=$1 AND company_id=$2",[req.params.userId,req.user.companyId])).rows[0];
    if(!user?.active)return res.status(404).json({success:false,message:"Active user not found"});
    const policy=await loadEffectiveAssurance(db,{companyId:req.user.companyId,userId:user.id,roleId:user.role_id});
    if(!policy.effective.mfaRequired)return res.status(409).json({success:false,message:"Temporary verification codes are available only for users who require MFA"});
    try{
      const code=await generateTemporaryVerificationCode(db,{companyId:req.user.companyId,userId:user.id,generatedBy:req.user.id,expiresHours:req.body?.expiresHours});
      await writeAudit?.(req.user.companyId,req.user.id,"security.temp_mfa_code_generated","user",user.id,{expiresAt:code.expires_at});
      res.status(201).json({success:true,data:{code:code.code,expiresAt:code.expires_at}});
    }catch(error){
      if(error?.status)return res.status(error.status).json({success:false,code:error.code,message:error.message});
      throw error;
    }
  });

  router.post("/security/mfa/users/:userId/temporary-code/expire",...manage,async(req,res)=>{
    if(!req.authSession||!assuranceSatisfies(req.authSession.assurance_level,"HIGH")){
      return res.status(428).json({success:false,code:"STEP_UP_REQUIRED",resourceKey:"USER_ADMIN",message:"High-Assurance verification is required to expire a temporary MFA code"});
    }
    await db("UPDATE identity_temporary_verification_codes SET expired_at=NOW() WHERE company_id=$1 AND user_id=$2 AND expired_at IS NULL",[req.user.companyId,req.params.userId]);
    await writeAudit?.(req.user.companyId,req.user.id,"security.temp_mfa_code_expired","user",req.params.userId,{});
    res.json({success:true});
  });

  router.post("/security/mfa/users/:userId/methods/:methodId/disconnect",...manage,async(req,res)=>{
    const r=await db(`UPDATE identity_mfa_methods SET active=FALSE
      WHERE id=$1 AND user_id=$2 AND company_id=$3 RETURNING id`,[req.params.methodId,req.params.userId,req.user.companyId]);
    if(!r.rows.length)return res.status(404).json({success:false,message:"MFA method not found"});
    await writeAudit?.(req.user.companyId,req.user.id,"security.mfa_method_disconnected","identity_mfa_method",req.params.methodId,{userId:req.params.userId});
    res.json({success:true});
  });

  router.get("/security/trusted-devices/all",...manage,async(req,res)=>{
    const r=await db(`SELECT d.id,d.user_id,u.username,u.full_name,d.device_name,d.platform,d.browser,d.first_ip::text,d.last_ip::text,
      d.trusted_until,d.created_at,d.last_seen_at,d.revoked_at
      FROM identity_trusted_devices d JOIN users u ON u.id=d.user_id
      WHERE d.company_id=$1 ORDER BY d.last_seen_at DESC`,[req.user.companyId]);
    res.json({success:true,data:r.rows});
  });

  router.post("/security/trusted-devices/:id/admin-revoke",...manage,async(req,res)=>{
    const r=await db("UPDATE identity_trusted_devices SET revoked_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING id",[req.params.id,req.user.companyId]);
    if(!r.rows.length)return res.status(404).json({success:false,message:"Trusted device not found"});
    await writeAudit?.(req.user.companyId,req.user.id,"security.trusted_device_revoked","identity_trusted_device",req.params.id,{});
    res.json({success:true});
  });

  router.get("/security/trusted-devices",authenticate,async(req,res)=>{
    const r=await db(`SELECT id,device_name,platform,browser,first_ip::text,last_ip::text,trusted_until,created_at,last_seen_at,revoked_at
      FROM identity_trusted_devices WHERE company_id=$1 AND user_id=$2 ORDER BY last_seen_at DESC`,[req.user.companyId,req.user.id]);
    res.json({success:true,data:r.rows});
  });
  router.post("/security/trusted-devices/:id/revoke",authenticate,async(req,res)=>{
    await db("UPDATE identity_trusted_devices SET revoked_at=NOW() WHERE id=$1 AND company_id=$2 AND user_id=$3",[req.params.id,req.user.companyId,req.user.id]);
    res.json({success:true});
  });

  router.put("/security/step-up/:resourceKey",...manage,async(req,res)=>{
    const action=["ALLOW","RAISE","BLOCK"].includes(String(req.body?.action||"").toUpperCase())?String(req.body.action).toUpperCase():"RAISE";
    const required=["STANDARD","HIGH"].includes(String(req.body?.requiredAssurance||"").toUpperCase())?String(req.body.requiredAssurance).toUpperCase():"HIGH";
    const minutes=req.body?.reverifyAfterMinutes==null?null:Math.min(1440,Math.max(1,Number(req.body.reverifyAfterMinutes)||15));
    const r=await db(`INSERT INTO identity_step_up_policies(company_id,resource_key,action,required_assurance,reverify_after_minutes,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$6)
      ON CONFLICT(company_id,resource_key) DO UPDATE SET action=EXCLUDED.action,required_assurance=EXCLUDED.required_assurance,
        reverify_after_minutes=EXCLUDED.reverify_after_minutes,active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,
      [req.user.companyId,req.params.resourceKey,action,required,minutes,req.user.id]);
    res.json({success:true,data:r.rows[0]});
  });

  router.get("/security/auth-providers",...manage,async(req,res)=>{
    const r=await db("SELECT * FROM identity_auth_providers WHERE company_id=$1 ORDER BY name",[req.user.companyId]);
    res.json({success:true,data:r.rows.map(safeProvider)});
  });

  router.post("/security/auth-providers",...manage,async(req,res)=>{
    const b=req.body||{};const type=String(b.providerType||"OIDC").toUpperCase();
    if(!["GOOGLE","APPLE","OIDC","SAML"].includes(type))return res.status(400).json({success:false,message:"Unsupported authentication provider type"});
    const key=String(b.providerKey||b.name||"").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"-");
    if(!key||!String(b.name||"").trim())return res.status(400).json({success:false,message:"Provider name and key are required"});
    const credentials=b.credentials&&typeof b.credentials==="object"?encryptCredentials(b.credentials):null;
    const r=await db(`INSERT INTO identity_auth_providers(company_id,name,provider_key,provider_type,enabled,show_on_login,use_oneengine_mfa,assurance_level,configuration,credentials_encrypted,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$11) RETURNING *`,
      [req.user.companyId,String(b.name).trim(),key,type,b.enabled===true,b.showOnLogin!==false,b.useOneEngineMfa===true,
       String(b.assuranceLevel||"STANDARD").toUpperCase()==="HIGH"?"HIGH":"STANDARD",JSON.stringify(b.configuration||{}),credentials,req.user.id]);
    res.status(201).json({success:true,data:safeProvider(r.rows[0])});
  });

  router.put("/security/auth-providers/:id",...manage,async(req,res)=>{
    const current=(await db("SELECT * FROM identity_auth_providers WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId])).rows[0];
    if(!current)return res.status(404).json({success:false,message:"Authentication provider not found"});
    const b=req.body||{};
    const suppliedCredentials=b.credentials&&typeof b.credentials==="object"?b.credentials:null;
    const hasSuppliedCredential=suppliedCredentials&&Object.values(suppliedCredentials).some((value)=>String(value??"").trim()!=="");
    const credentials=hasSuppliedCredential?encryptCredentials(suppliedCredentials):current.credentials_encrypted;
    const r=await db(`UPDATE identity_auth_providers SET name=$1,enabled=$2,show_on_login=$3,use_oneengine_mfa=$4,assurance_level=$5,
      configuration=$6::jsonb,credentials_encrypted=$7,updated_by=$8,updated_at=NOW() WHERE id=$9 AND company_id=$10 RETURNING *`,
      [String(b.name??current.name).trim(),b.enabled===undefined?current.enabled:b.enabled===true,b.showOnLogin===undefined?current.show_on_login:b.showOnLogin!==false,
       b.useOneEngineMfa===undefined?current.use_oneengine_mfa:b.useOneEngineMfa===true,String(b.assuranceLevel||current.assurance_level).toUpperCase()==="HIGH"?"HIGH":"STANDARD",
       JSON.stringify(b.configuration??current.configuration??{}),credentials,req.user.id,current.id,req.user.companyId]);
    res.json({success:true,data:safeProvider(r.rows[0])});
  });

  router.post("/security/auth-providers/:id/test",...manage,async(req,res)=>{
    const provider=(await db("SELECT * FROM identity_auth_providers WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId])).rows[0];
    if(!provider)return res.status(404).json({success:false,message:"Authentication provider not found"});
    const cfg=provider.configuration||{};
    try{
      if(["OIDC","APPLE","GOOGLE"].includes(provider.provider_type)){
        const isApple=provider.provider_type==="APPLE";
        const authorizationEndpoint=cfg.authorizationEndpoint||(isApple?"https://appleid.apple.com/auth/authorize":null);
        const tokenEndpoint=cfg.tokenEndpoint||(isApple?"https://appleid.apple.com/auth/token":null);
        const urls=[authorizationEndpoint,tokenEndpoint,...(isApple?[]:[cfg.userInfoEndpoint])].filter(Boolean);
        if(urls.length<(isApple?2:3))return res.status(400).json({success:false,message:isApple?"Apple authorization and token endpoints are required":"Authorization, token and user-info endpoints are required"});
        for(const value of urls){const url=new URL(String(value));if(url.protocol!=="https:")throw new Error("Provider endpoints must use HTTPS");}
        const discovery=cfg.discoveryUrl?await fetch(String(cfg.discoveryUrl),{headers:{Accept:"application/json"}}):null;
        if(discovery&&!discovery.ok)throw new Error(`Discovery endpoint returned HTTP ${discovery.status}`);
        return res.json({success:true,data:{ok:true,message:isApple?"Apple Sign in configuration is valid.":"OIDC provider configuration is valid.",discovery:discovery?await discovery.json():null}});
      }
      if(provider.provider_type==="SAML"){
        if(!cfg.entryPoint||!cfg.issuer||!cfg.idpCert)throw new Error("SAML entry point, issuer/entity ID, and IdP certificate are required");
        const entry=new URL(String(cfg.entryPoint));if(entry.protocol!=="https:")throw new Error("SAML entry point must use HTTPS");
        if(!/BEGIN CERTIFICATE/.test(String(cfg.idpCert)))throw new Error("IdP certificate must be PEM encoded");
        return res.json({success:true,data:{ok:true,message:"SAML provider configuration is valid."}});
      }
      return res.status(400).json({success:false,message:"Unsupported provider type"});
    }catch(error){return res.status(400).json({success:false,message:error.message||"Provider configuration is invalid"});}
  });

  router.delete("/security/auth-providers/:id",...manage,async(req,res)=>{
    await db("DELETE FROM identity_auth_providers WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId]);
    res.json({success:true});
  });

  return router;
}
