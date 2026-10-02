import crypto from "node:crypto";
import { encryptCredentials, decryptCredentials } from "./integrationCredentials.js";
import { loadSecuritySettings, resolveAccessPolicy } from "./identitySecurity.js";

const BASE32="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function effectiveAssurance(settings, policy) {
  const pick=(key)=>policy?.[key] == null ? settings?.[key] : policy[key];
  return {
    mfaRequired: pick("mfa_required") === true,
    phishingResistantRequired: pick("phishing_resistant_mfa_required") === true,
    requiredLoginAssurance: String(pick("required_login_assurance") || "STANDARD").toUpperCase(),
    trustedDeviceDays: Math.max(0, Number(pick("trusted_device_days") ?? 30)),
    trustSsoMfa: pick("trust_sso_mfa") !== false,
    deviceActivationRequired: pick("device_activation_required") === true,
    skipDeviceActivationOnTrustedNetwork: pick("skip_device_activation_on_trusted_network") !== false,
    passwordAssurance: String(settings?.password_assurance || "STANDARD").toUpperCase(),
    totpAssurance: String(settings?.totp_assurance || "STANDARD").toUpperCase(),
    passkeyAssurance: String(settings?.passkey_assurance || "HIGH").toUpperCase(),
    ssoAssurance: String(settings?.sso_assurance || "STANDARD").toUpperCase(),
    stepUpPeriodMinutes: Math.max(1, Number(settings?.step_up_period_minutes || 15)),
    allowTotp: settings?.allow_totp !== false,
    allowPlatformPasskeys: settings?.allow_platform_passkeys !== false,
    allowSecurityKeys: settings?.allow_security_keys !== false,
    allowRecoveryCodes: settings?.allow_recovery_codes !== false,
  };
}

export async function loadEffectiveAssurance(db,{companyId,userId,roleId}) {
  const [settings,policy]=await Promise.all([
    loadSecuritySettings(db,companyId),
    resolveAccessPolicy(db,{companyId,userId,roleId}),
  ]);
  return {settings,policy,effective:effectiveAssurance(settings,policy)};
}

export function assuranceRank(level){ return String(level||"STANDARD").toUpperCase()==="HIGH" ? 2 : 1; }
export function assuranceSatisfies(actual,required){ return assuranceRank(actual)>=assuranceRank(required); }

function randomBase32(bytes=20){
  const input=crypto.randomBytes(bytes);
  let bits=0,value=0,out="";
  for(const byte of input){
    value=(value<<8)|byte;bits+=8;
    while(bits>=5){out+=BASE32[(value>>>(bits-5))&31];bits-=5;}
  }
  if(bits>0)out+=BASE32[(value<<(5-bits))&31];
  return out;
}
function decodeBase32(text){
  const clean=String(text||"").toUpperCase().replace(/=+$/,"").replace(/\s+/g,"");
  let bits=0,value=0;const out=[];
  for(const ch of clean){
    const idx=BASE32.indexOf(ch); if(idx<0)throw new Error("Invalid base32");
    value=(value<<5)|idx;bits+=5;
    if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}
  }
  return Buffer.from(out);
}
function hotp(secret,counter,digits=6){
  const buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));
  const digest=crypto.createHmac("sha1",decodeBase32(secret)).update(buf).digest();
  const offset=digest[digest.length-1]&15;
  const n=((digest[offset]&127)<<24)|(digest[offset+1]<<16)|(digest[offset+2]<<8)|digest[offset+3];
  return String(n%(10**digits)).padStart(digits,"0");
}
export function verifyTotp(secret,code,{period=30,window=1,now=Date.now()}={}){
  const candidate=String(code||"").replace(/\s+/g,"");
  if(!/^\d{6}$/.test(candidate))return false;
  const counter=Math.floor(now/1000/period);
  for(let i=-window;i<=window;i++){
    const expected=hotp(secret,counter+i);
    const a=Buffer.from(candidate),b=Buffer.from(expected);
    if(a.length===b.length&&crypto.timingSafeEqual(a,b))return true;
  }
  return false;
}
export function createTotpSecret(){return randomBase32(20);}
export function totpUri({secret,email,issuer="OneEngine"}){
  const label=encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

export async function listMfaMethods(db,{companyId,userId,includeUnverified=false}){
  const r=await db(`SELECT id,method_type,label,credential_id,sign_count,transports,aaguid,discoverable,authenticator_kind,phishing_resistant,verified,active,created_at,last_used_at
    FROM identity_mfa_methods WHERE company_id=$1 AND user_id=$2 AND active=TRUE ${includeUnverified?"":"AND verified=TRUE"} ORDER BY created_at`,[companyId,userId]);
  return r.rows;
}

export async function createPendingChallenge(db,{companyId,userId,type="LOGIN",context={},minutes=10,challenge=null}){
  const value=challenge||crypto.randomBytes(32).toString("base64url");
  const r=await db(`INSERT INTO identity_mfa_challenges(company_id,user_id,challenge_type,challenge,context,expires_at)
    VALUES($1,$2,$3,$4,$5::jsonb,NOW()+($6::text||' minutes')::interval) RETURNING *`,
    [companyId,userId,type,value,JSON.stringify(context||{}),Math.max(1,Number(minutes)||10)]);
  return r.rows[0];
}
export async function getPendingChallenge(db,id,{types=[]}={}){
  const r=await db(`SELECT * FROM identity_mfa_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW() LIMIT 1`,[id]);
  const row=r.rows[0]||null;
  if(!row)return null;
  if(types.length&&!types.includes(row.challenge_type))return null;
  return row;
}
export async function consumeChallenge(db,id){
  const r=await db("UPDATE identity_mfa_challenges SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW() RETURNING *",[id]);
  return r.rows[0]||null;
}

export async function startTotpEnrollment(db,{companyId,userId,email,label="Authenticator"}){
  await db("UPDATE identity_mfa_methods SET active=FALSE WHERE user_id=$1 AND method_type='TOTP' AND verified=FALSE",[userId]);
  const secret=createTotpSecret();
  const cipher=encryptCredentials({secret});
  const r=await db(`INSERT INTO identity_mfa_methods(company_id,user_id,method_type,label,secret_ciphertext,verified,phishing_resistant)
    VALUES($1,$2,'TOTP',$3,$4,FALSE,FALSE) RETURNING id,label,created_at`,[companyId,userId,label,cipher]);
  return {...r.rows[0],secret,uri:totpUri({secret,email})};
}
export async function verifyTotpMethod(db,{companyId,userId,methodId,code,markVerified=false}){
  const r=await db(`SELECT * FROM identity_mfa_methods WHERE id=$1 AND company_id=$2 AND user_id=$3 AND method_type='TOTP' AND active=TRUE LIMIT 1`,[methodId,companyId,userId]);
  const method=r.rows[0]; if(!method)return false;
  const secret=decryptCredentials(method.secret_ciphertext)?.secret;
  if(!secret||!verifyTotp(secret,code))return false;
  await db(`UPDATE identity_mfa_methods SET verified=CASE WHEN $2 THEN TRUE ELSE verified END,last_used_at=NOW() WHERE id=$1`,[method.id,markVerified===true]);
  return true;
}

export function generateRecoveryCodes(count=10){
  return Array.from({length:count},()=>crypto.randomBytes(6).toString("hex").toUpperCase().match(/.{1,4}/g).join("-"));
}
function hashRecoveryCode(code){return crypto.createHash("sha256").update(String(code||"").replace(/\s+/g,"").toUpperCase()).digest("hex");}
export async function replaceRecoveryCodes(db,{companyId,userId}){
  const codes=generateRecoveryCodes();
  await db("UPDATE identity_mfa_methods SET active=FALSE WHERE user_id=$1 AND method_type='RECOVERY_CODES' AND active=TRUE",[userId]);
  await db(`INSERT INTO identity_mfa_methods(company_id,user_id,method_type,label,secret_ciphertext,verified,phishing_resistant)
    VALUES($1,$2,'RECOVERY_CODES','Recovery Codes',$3,TRUE,FALSE)`,
    [companyId,userId,encryptCredentials({hashes:codes.map(hashRecoveryCode)})]);
  return codes;
}
export async function consumeRecoveryCode(db,{companyId,userId,code}){
  const r=await db(`SELECT * FROM identity_mfa_methods WHERE company_id=$1 AND user_id=$2 AND method_type='RECOVERY_CODES' AND active=TRUE AND verified=TRUE ORDER BY created_at DESC LIMIT 1`,[companyId,userId]);
  const method=r.rows[0]; if(!method)return false;
  const payload=decryptCredentials(method.secret_ciphertext)||{};
  const hash=hashRecoveryCode(code); const hashes=Array.isArray(payload.hashes)?payload.hashes:[];
  const index=hashes.indexOf(hash); if(index<0)return false;
  hashes.splice(index,1);
  await db("UPDATE identity_mfa_methods SET secret_ciphertext=$1,last_used_at=NOW() WHERE id=$2",[encryptCredentials({hashes}),method.id]);
  return true;
}

export function deviceFingerprintInfo(req){
  const ua=String(req.get?.("user-agent")||"");
  const platform=/Windows/i.test(ua)?"Windows":/Android/i.test(ua)?"Android":/iPhone|iPad|iOS/i.test(ua)?"iOS":/Mac OS|Macintosh/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"Unknown";
  const browser=/Edg\//i.test(ua)?"Edge":/Chrome\//i.test(ua)?"Chrome":/Firefox\//i.test(ua)?"Firefox":/Safari\//i.test(ua)?"Safari":"Other";
  return {ua,platform,browser};
}
export function newDeviceToken(){return crypto.randomBytes(32).toString("base64url");}
export function hashDeviceToken(token){return crypto.createHash("sha256").update(String(token||"")).digest("hex");}
export async function trustDevice(db,{companyId,userId,token,name,days,ip,req}){
  if(!token||days<=0)return null;
  const info=deviceFingerprintInfo(req);
  const r=await db(`INSERT INTO identity_trusted_devices(company_id,user_id,device_token_hash,device_name,platform,browser,first_ip,last_ip,trusted_until)
    VALUES($1,$2,$3,$4,$5,$6,$7::inet,$7::inet,NOW()+($8::text||' days')::interval)
    ON CONFLICT(device_token_hash) DO UPDATE SET device_name=EXCLUDED.device_name,last_ip=EXCLUDED.last_ip,
      trusted_until=EXCLUDED.trusted_until,last_seen_at=NOW(),revoked_at=NULL RETURNING *`,
    [companyId,userId,hashDeviceToken(token),String(name||"").trim()||null,info.platform,info.browser,ip,days]);
  return r.rows[0];
}
export async function findTrustedDevice(db,{companyId,userId,token,ip}){
  if(!token)return null;
  const r=await db(`SELECT * FROM identity_trusted_devices WHERE company_id=$1 AND user_id=$2 AND device_token_hash=$3
    AND revoked_at IS NULL AND trusted_until>NOW() LIMIT 1`,[companyId,userId,hashDeviceToken(token)]);
  const row=r.rows[0]||null;
  if(row)await db("UPDATE identity_trusted_devices SET last_seen_at=NOW(),last_ip=$2::inet WHERE id=$1",[row.id,ip]);
  return row;
}

export async function effectiveStepUpPolicy(db,{companyId,resourceKey}){
  const r=await db("SELECT * FROM identity_step_up_policies WHERE company_id=$1 AND resource_key=$2 AND active=TRUE LIMIT 1",[companyId,resourceKey]);
  return r.rows[0]||null;
}
export function stepUpRequired({session,policy,defaultMinutes=15}){
  if(!policy||policy.action==="ALLOW")return false;
  if(policy.action==="BLOCK")return true;
  if(!assuranceSatisfies(session?.assurance_level,policy.required_assurance||"HIGH"))return true;
  const minutes=Number(policy.reverify_after_minutes||defaultMinutes||15);
  const verified=session?.assurance_verified_at?new Date(session.assurance_verified_at).getTime():0;
  return !verified || Date.now()-verified>minutes*60000;
}


function hashTemporaryCode(code){
  return crypto.createHash("sha256").update(String(code||"").replace(/\s+/g,"")).digest("hex");
}

export async function generateTemporaryVerificationCode(db,{companyId,userId,generatedBy,expiresHours=1}){
  const hours=Math.min(24,Math.max(1,Number(expiresHours)||1));
  const recent=await db(`SELECT COUNT(*)::int count FROM identity_temporary_verification_codes
    WHERE user_id=$1 AND generated_at>NOW()-INTERVAL '1 hour'`,[userId]);
  if(Number(recent.rows[0]?.count||0)>=6){
    const error=new Error("No more than six temporary verification codes can be generated per user per hour");
    error.code="TEMP_CODE_RATE_LIMIT"; error.status=429; throw error;
  }
  await db("UPDATE identity_temporary_verification_codes SET expired_at=NOW() WHERE user_id=$1 AND expired_at IS NULL",[userId]);
  const code=String(crypto.randomInt(0,100000000)).padStart(8,"0");
  const r=await db(`INSERT INTO identity_temporary_verification_codes(company_id,user_id,code_hash,expires_at,generated_by)
    VALUES($1,$2,$3,NOW()+($4::text||' hours')::interval,$5) RETURNING id,expires_at,generated_at`,
    [companyId,userId,hashTemporaryCode(code),hours,generatedBy||null]);
  return {...r.rows[0],code};
}

export async function verifyTemporaryVerificationCode(db,{companyId,userId,code}){
  const value=String(code||"").replace(/\s+/g,"");
  if(!/^\d{8}$/.test(value))return false;
  const r=await db(`SELECT id,code_hash FROM identity_temporary_verification_codes
    WHERE company_id=$1 AND user_id=$2 AND expired_at IS NULL AND expires_at>NOW()
    ORDER BY generated_at DESC LIMIT 1`,[companyId,userId]);
  const row=r.rows[0];if(!row)return false;
  const a=Buffer.from(hashTemporaryCode(value)),b=Buffer.from(row.code_hash);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export async function activeTemporaryVerificationCode(db,{companyId,userId}){
  const r=await db(`SELECT id,expires_at,generated_at FROM identity_temporary_verification_codes
    WHERE company_id=$1 AND user_id=$2 AND expired_at IS NULL AND expires_at>NOW()
    ORDER BY generated_at DESC LIMIT 1`,[companyId,userId]);
  return r.rows[0]||null;
}

export async function writeVerificationHistory(db,{companyId,userId,eventType,method=null,status="SUCCESS",challengeType=null,assuranceLevel=null,ip=null,userAgent=null,sessionId=null,details={}}){
  try{
    await db(`INSERT INTO identity_verification_history(company_id,user_id,event_type,method,status,challenge_type,assurance_level,ip_address,user_agent,session_id,details)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::inet,$9,$10,$11::jsonb)`,
      [companyId,userId||null,String(eventType||"VERIFICATION"),method?String(method):null,String(status||"SUCCESS"),challengeType?String(challengeType):null,
       assuranceLevel?String(assuranceLevel):null,ip||null,userAgent||null,sessionId||null,JSON.stringify(details||{})]);
  }catch(error){
    console.error("identity verification history write failed",error?.message||error);
  }
}

export function mfaMethodPriority(method){
  if(method?.method_type==="PASSKEY"&&method?.authenticator_kind==="PLATFORM")return 1;
  if(method?.method_type==="PASSKEY"&&method?.authenticator_kind==="SECURITY_KEY")return 2;
  if(method?.method_type==="PASSKEY")return 3;
  if(method?.method_type==="TOTP")return 4;
  if(method?.method_type==="RECOVERY_CODES")return 5;
  return 99;
}

export function sortMfaMethods(methods){
  return [...(Array.isArray(methods)?methods:[])].sort((a,b)=>{
    const diff=mfaMethodPriority(a)-mfaMethodPriority(b);
    if(diff)return diff;
    return new Date(a.created_at||0)-new Date(b.created_at||0);
  });
}

export function mfaMethodAllowed(method,effective){
  if(!method)return false;
  if(method.method_type==="TOTP")return effective?.allowTotp!==false;
  if(method.method_type==="RECOVERY_CODES")return effective?.allowRecoveryCodes!==false;
  if(method.method_type==="PASSKEY"){
    if(method.authenticator_kind==="SECURITY_KEY")return effective?.allowSecurityKeys!==false;
    if(method.authenticator_kind==="PLATFORM")return effective?.allowPlatformPasskeys!==false;
    return effective?.allowPlatformPasskeys!==false||effective?.allowSecurityKeys!==false;
  }
  return false;
}
