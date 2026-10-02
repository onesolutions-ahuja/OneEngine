import express from "express";
import crypto from "node:crypto";
import { accessDecision, clientIp, createTrackedSession, loadSecuritySettings, writeLoginHistory } from "../services/identitySecurity.js";
import { assuranceSatisfies, createPendingChallenge, listMfaMethods, loadEffectiveAssurance, mfaMethodAllowed, sortMfaMethods } from "../services/identityAssurance.js";

function hash(value){return crypto.createHash("sha256").update(String(value||"")).digest("hex");}
function b64url(buffer){return Buffer.from(buffer).toString("base64url");}
function safeReturnTo(value){
  const fallback="https://onesolutions-ahuja.github.io/OneEngine/";
  try{
    const url=new URL(String(value||fallback));
    if(url.protocol!=="https:")return fallback;
    if(url.hostname==="onesolutions-ahuja.github.io"||url.hostname==="onepos.com"||url.hostname.endsWith(".onepos.com"))return url.toString();
  }catch{}
  return fallback;
}
function providerErrorRedirect(returnTo,code){
  const url=new URL(safeReturnTo(returnTo));url.hash=`provider_error=${encodeURIComponent(code)}`;return url.toString();
}
function credentials(provider,decryptCredentials){
  try{return decryptCredentials(provider.credentials_encrypted)||{};}catch{return {};}
}
async function loadProviderForEmail(db,email,key){
  const u=await db("SELECT id,company_id,active FROM users WHERE LOWER(BTRIM(email))=LOWER(BTRIM($1)) LIMIT 1",[email]);
  const user=u.rows[0];if(!user?.active||!user?.company_id)return null;
  const p=await db("SELECT * FROM identity_auth_providers WHERE company_id=$1 AND provider_key=$2 AND enabled=TRUE LIMIT 1",[user.company_id,key]);
  return p.rows[0]?{provider:p.rows[0],user}:null;
}
function providerPublic(row){
  return {key:row.provider_key,name:row.name,type:row.provider_type,assuranceLevel:row.assurance_level,useOneEngineMfa:row.use_oneengine_mfa===true};
}
function decodeJwtJson(segment){
  return JSON.parse(Buffer.from(String(segment||""),"base64url").toString("utf8"));
}
async function oidcMetadata(cfg){
  const discoveryUrl=String(cfg?.discoveryUrl||"").trim();
  if(!discoveryUrl)return {};
  const response=await fetch(discoveryUrl,{headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("OIDC discovery document is unavailable");
  const metadata=await response.json();
  return metadata&&typeof metadata==="object"?metadata:{};
}

function audienceMatches(aud,clientId){
  return Array.isArray(aud)?aud.map(String).includes(String(clientId)):String(aud||"")===String(clientId);
}

async function verifyOidcIdToken(idToken,{clientId,nonce,issuer,jwksUri}){
  const parts=String(idToken||"").split(".");
  if(parts.length!==3)throw new Error("OIDC ID token is malformed");
  const header=decodeJwtJson(parts[0]),claims=decodeJwtJson(parts[1]);
  if(!["RS256","RS384","RS512","ES256","ES384"].includes(String(header.alg||""))||!header.kid)throw new Error("OIDC ID token algorithm is unsupported");
  const response=await fetch(String(jwksUri||""),{headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error("OIDC signing keys are unavailable");
  const jwks=await response.json();
  const jwk=(jwks.keys||[]).find(key=>key.kid===header.kid);
  if(!jwk)throw new Error("OIDC signing key is unavailable");
  const key=crypto.createPublicKey({key:jwk,format:"jwk"});
  const algorithms={RS256:"RSA-SHA256",RS384:"RSA-SHA384",RS512:"RSA-SHA512",ES256:"SHA256",ES384:"SHA384"};
  const verifierKey=String(header.alg).startsWith("ES")?{key,dsaEncoding:"ieee-p1363"}:key;
  const valid=crypto.verify(algorithms[header.alg],Buffer.from(`${parts[0]}.${parts[1]}`),verifierKey,Buffer.from(parts[2],"base64url"));
  if(!valid)throw new Error("OIDC ID token signature is invalid");
  const now=Math.floor(Date.now()/1000);
  if(issuer&&String(claims.iss)!==String(issuer))throw new Error("OIDC issuer is invalid");
  if(!audienceMatches(claims.aud,clientId))throw new Error("OIDC audience is invalid");
  if(Number(claims.exp||0)<=now)throw new Error("OIDC ID token is expired");
  if(Number(claims.iat||0)>now+300)throw new Error("OIDC ID token issued-at time is invalid");
  if(nonce&&String(claims.nonce||"")!==String(nonce))throw new Error("OIDC nonce is invalid");
  return claims;
}

async function verifyAppleIdToken(idToken,{clientId,nonce,jwksUri="https://appleid.apple.com/auth/keys",issuer="https://appleid.apple.com"}){
  const parts=String(idToken||"").split(".");if(parts.length!==3)throw new Error("Apple ID token is malformed");
  const header=decodeJwtJson(parts[0]),claims=decodeJwtJson(parts[1]);
  if(header.alg!=="RS256"||!header.kid)throw new Error("Apple ID token algorithm is invalid");
  const response=await fetch(jwksUri,{headers:{Accept:"application/json"}});if(!response.ok)throw new Error("Unable to load Apple signing keys");
  const jwks=await response.json();const jwk=(jwks.keys||[]).find(key=>key.kid===header.kid&&key.kty==="RSA");
  if(!jwk)throw new Error("Apple signing key is unavailable");
  const key=crypto.createPublicKey({key:jwk,format:"jwk"});
  const valid=crypto.verify("RSA-SHA256",Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],"base64url"));
  if(!valid)throw new Error("Apple ID token signature is invalid");
  const now=Math.floor(Date.now()/1000);
  if(claims.iss!==issuer||String(claims.aud)!==String(clientId)||Number(claims.exp||0)<=now)throw new Error("Apple ID token claims are invalid");
  if(nonce&&String(claims.nonce||"")!==String(nonce))throw new Error("Apple ID token nonce is invalid");
  return claims;
}

export default function createIdentityProviderLoginRouter({db,createToken,decryptCredentials,encryptCredentials}) {
  const router=express.Router();

  async function completeProviderLogin(req,res,{provider,email,returnTo,authMethod,assertedHighAssurance=false}){
    const result=await db(`SELECT u.id,u.username,u.email,u.full_name,u.company_id,u.store_id,u.role_id,u.active,u.must_change_password,
      r.name AS role_name,COALESCE(r.default_landing_page,'dashboard') AS default_landing_page
      FROM users u LEFT JOIN roles r ON r.id=u.role_id
      WHERE LOWER(BTRIM(u.email))=LOWER(BTRIM($1)) AND u.company_id=$2 LIMIT 1`,[email,provider.company_id]);
    const user=result.rows[0];
    if(!user?.active)return res.redirect(providerErrorRedirect(returnTo,"account_not_linked"));
    const ip=clientIp(req),agent=req.get("user-agent")||null;
    const access=await accessDecision(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id,ip});
    if(!access.allowed){
      await writeLoginHistory(db,{user,identifier:email,status:"BLOCKED",reason:access.code,ip,userAgent:agent,authMethod,req});
      return res.redirect(providerErrorRedirect(returnTo,String(access.code||"security_policy_blocked").toLowerCase()));
    }
    await db("UPDATE users SET last_login_at=NOW() WHERE id=$1",[user.id]);
    const assurance=await loadEffectiveAssurance(db,{companyId:user.company_id,userId:user.id,roleId:user.role_id});
    const baseAssurance=assertedHighAssurance||provider.assurance_level==="HIGH" ? "HIGH" : assurance.effective.ssoAssurance;
    const activationSatisfied=!assurance.effective.deviceActivationRequired
      || baseAssurance==="HIGH"
      || (assurance.effective.skipDeviceActivationOnTrustedNetwork && access.trustedNetwork===true);
    const needsMfa=provider.use_oneengine_mfa===true
      || (assurance.effective.mfaRequired && !assurance.effective.trustSsoMfa)
      || assurance.effective.phishingResistantRequired
      || !assuranceSatisfies(baseAssurance,assurance.effective.requiredLoginAssurance)
      || !activationSatisfied;
    if(needsMfa){
      const methods=await listMfaMethods(db,{companyId:user.company_id,userId:user.id});
      const usable=sortMfaMethods(methods
        .filter((method)=>mfaMethodAllowed(method,assurance.effective))
        .filter((method)=>!assurance.effective.phishingResistantRequired||method.phishing_resistant===true));
      const challenge=await createPendingChallenge(db,{
        companyId:user.company_id,userId:user.id,type:"LOGIN",
        context:{authMethod,providerId:provider.id,phishingResistantRequired:assurance.effective.phishingResistantRequired===true,activationOnly:!activationSatisfied&&!assurance.effective.mfaRequired,deviceActivationPending:!activationSatisfied},
        minutes:10,
      });
      const target=new URL(safeReturnTo(returnTo));
      target.hash=`provider_mfa_challenge=${encodeURIComponent(challenge.id)}&provider_mfa_enroll=${usable.length?"0":"1"}&provider_mfa_phishing_resistant=${assurance.effective.phishingResistantRequired?"1":"0"}`;
      return res.redirect(target.toString());
    }
    const settings=await loadSecuritySettings(db,user.company_id);
    const sessionId=await createTrackedSession(db,{
      user,ip,userAgent:agent,authMethod,settings,
      originHost:String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").split(",")[0].trim().toLowerCase()||null,
    });
    await db("UPDATE identity_sessions SET assurance_level=$2,assurance_verified_at=NOW(),mfa_method=$3 WHERE id=$1",
      [sessionId,baseAssurance,baseAssurance==="HIGH"?"SSO_MFA":null]);
    user.session_id=sessionId;
    const token=createToken(user);
    await writeLoginHistory(db,{user,identifier:email,status:"SUCCESS",ip,userAgent:agent,authMethod,sessionId,req});
    const target=new URL(safeReturnTo(returnTo));target.hash=`provider_token=${encodeURIComponent(token)}`;return res.redirect(target.toString());
  }

  router.get("/auth/providers",async(req,res)=>{
    const email=String(req.query?.email||"").trim().toLowerCase();
    if(!email)return res.json({success:true,data:[]});
    const u=await db("SELECT company_id,active FROM users WHERE LOWER(BTRIM(email))=$1 LIMIT 1",[email]);
    if(!u.rows[0]?.active||!u.rows[0]?.company_id)return res.json({success:true,data:[]});
    const r=await db("SELECT * FROM identity_auth_providers WHERE company_id=$1 AND enabled=TRUE AND show_on_login=TRUE ORDER BY name",[u.rows[0].company_id]);
    res.json({success:true,data:r.rows.map(providerPublic)});
  });

  router.get("/auth/provider/:key/start",async(req,res)=>{
    const email=String(req.query?.email||"").trim().toLowerCase();
    const returnTo=safeReturnTo(req.query?.returnTo);
    const found=await loadProviderForEmail(db,email,req.params.key);
    if(!found)return res.redirect(providerErrorRedirect(returnTo,"provider_not_available"));
    const {provider}=found;
    if(!["OIDC","APPLE","GOOGLE"].includes(provider.provider_type))return res.redirect(providerErrorRedirect(returnTo,"provider_protocol_mismatch"));
    const cfg=provider.configuration||{},cred=credentials(provider,decryptCredentials);
    const isApple=provider.provider_type==="APPLE";
    const discovered=!isApple&&cfg.discoveryUrl?await oidcMetadata(cfg):{};
    const authorizationEndpoint=String(cfg.authorizationEndpoint||discovered.authorization_endpoint||(isApple?"https://appleid.apple.com/auth/authorize":"")).trim();
    const tokenEndpoint=String(cfg.tokenEndpoint||discovered.token_endpoint||(isApple?"https://appleid.apple.com/auth/token":"")).trim();
    const userInfoEndpoint=String(cfg.userInfoEndpoint||discovered.userinfo_endpoint||"").trim();
    const clientId=String(cred.clientId||cfg.clientId||"").trim();
    const redirectUri=String(cfg.redirectUri||"").trim();
    if(!authorizationEndpoint||!tokenEndpoint||(!isApple&&!userInfoEndpoint)||!clientId||!redirectUri)return res.redirect(providerErrorRedirect(returnTo,"provider_not_configured"));
    const stateToken=crypto.randomBytes(32).toString("base64url");
    const verifier=crypto.randomBytes(48).toString("base64url");
    const nonce=crypto.randomBytes(24).toString("base64url");
    await db(`INSERT INTO identity_auth_provider_states(company_id,provider_id,state_token_hash,login_email,return_to,nonce,code_verifier_ciphertext,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,NOW()+INTERVAL '10 minutes')`,
      [provider.company_id,provider.id,hash(stateToken),email,returnTo,nonce,encryptCredentials({verifier})]);
    const url=new URL(authorizationEndpoint);
    url.searchParams.set("client_id",clientId);url.searchParams.set("redirect_uri",redirectUri);url.searchParams.set("response_type","code");
    url.searchParams.set("scope",Array.isArray(cfg.scopes)?cfg.scopes.join(" "):String(cfg.scopes||(isApple?"name email":"openid email profile")));
    url.searchParams.set("state",stateToken);url.searchParams.set("nonce",nonce);
    if(cfg.usePkce!==false){
      url.searchParams.set("code_challenge",b64url(crypto.createHash("sha256").update(verifier).digest()));
      url.searchParams.set("code_challenge_method","S256");
    }
    if(isApple)url.searchParams.set("response_mode","form_post");
    if(email&&!isApple)url.searchParams.set("login_hint",email);
    return res.redirect(url.toString());
  });

  async function handleOidcCallback(req,res){
    const input={...(req.query||{}),...(req.body||{})};
    const stateToken=String(input.state||"");let returnTo="https://onesolutions-ahuja.github.io/OneEngine/";
    try{
      const state=(await db(`SELECT s.*,p.*,
        s.id AS state_id,s.return_to AS auth_return_to,s.login_email AS auth_login_email,s.nonce AS auth_nonce,
        s.code_verifier_ciphertext AS auth_verifier
        FROM identity_auth_provider_states s JOIN identity_auth_providers p ON p.id=s.provider_id
        WHERE s.state_token_hash=$1 AND s.consumed_at IS NULL AND s.expires_at>NOW() AND p.provider_key=$2 AND p.enabled=TRUE LIMIT 1`,
        [hash(stateToken),req.params.key])).rows[0];
      if(!state)return res.redirect(providerErrorRedirect(returnTo,"invalid_state"));
      returnTo=safeReturnTo(state.auth_return_to);
      await db("UPDATE identity_auth_provider_states SET consumed_at=NOW() WHERE id=$1",[state.state_id]);
      if(input.error)return res.redirect(providerErrorRedirect(returnTo,"provider_cancelled"));
      const cfg=state.configuration||{},cred=credentials(state,decryptCredentials);
      const code=String(input.code||"");if(!code)return res.redirect(providerErrorRedirect(returnTo,"missing_code"));
      const verifier=decryptCredentials(state.auth_verifier)?.verifier;
      const clientId=String(cred.clientId||cfg.clientId||"");
      const discovered=state.provider_type!=="APPLE"&&cfg.discoveryUrl?await oidcMetadata(cfg):{};
      const tokenEndpoint=String(cfg.tokenEndpoint||discovered.token_endpoint||(state.provider_type==="APPLE"?"https://appleid.apple.com/auth/token":""));
      const params=new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:String(cfg.redirectUri||""),client_id:clientId});
      if(cred.clientSecret)params.set("client_secret",String(cred.clientSecret));
      if(cfg.usePkce!==false&&verifier)params.set("code_verifier",verifier);
      const tokenResponse=await fetch(tokenEndpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:params});
      if(!tokenResponse.ok)return res.redirect(providerErrorRedirect(returnTo,"token_exchange_failed"));
      const tokens=await tokenResponse.json();
      let profile={};
      if(state.provider_type==="APPLE"){
        if(!tokens.id_token)return res.redirect(providerErrorRedirect(returnTo,"token_exchange_failed"));
        profile=await verifyAppleIdToken(tokens.id_token,{clientId,nonce:state.auth_nonce,jwksUri:cfg.jwksUri||undefined,issuer:cfg.issuer||undefined});
      }else{
        if(!tokens.id_token)return res.redirect(providerErrorRedirect(returnTo,"id_token_missing"));
        const issuer=String(cfg.issuer||discovered.issuer||"").trim();
        const jwksUri=String(cfg.jwksUri||discovered.jwks_uri||"").trim();
        if(!issuer||!jwksUri)return res.redirect(providerErrorRedirect(returnTo,"provider_not_configured"));
        const idClaims=await verifyOidcIdToken(tokens.id_token,{clientId,nonce:state.auth_nonce,issuer,jwksUri});
        profile={...idClaims};
        const userInfoEndpoint=String(cfg.userInfoEndpoint||discovered.userinfo_endpoint||"").trim();
        if(tokens.access_token&&userInfoEndpoint){
          const profileResponse=await fetch(userInfoEndpoint,{headers:{Authorization:`Bearer ${tokens.access_token}`,Accept:"application/json"}});
          if(!profileResponse.ok)return res.redirect(providerErrorRedirect(returnTo,"profile_lookup_failed"));
          profile={...profile,...await profileResponse.json()};
        }
      }
      const emailClaim=String(cfg.emailClaim||"email");const email=String(profile[emailClaim]||profile.email||"").trim().toLowerCase();
      if(!email||email!==String(state.auth_login_email||"").toLowerCase())return res.redirect(providerErrorRedirect(returnTo,"account_not_linked"));
      if(state.provider_type!=="APPLE"&&cfg.requireEmailVerified!==false&&profile.email_verified===false)return res.redirect(providerErrorRedirect(returnTo,"email_not_verified"));
      return completeProviderLogin(req,res,{provider:state,email,returnTo,authMethod:state.provider_type,assertedHighAssurance:state.assurance_level==="HIGH"});
    }catch(error){console.error("OIDC provider callback error",error);return res.redirect(providerErrorRedirect(returnTo,"provider_login_failed"));}
  }
  router.get("/auth/provider/:key/callback",handleOidcCallback);
  router.post("/auth/provider/:key/callback",handleOidcCallback);

  function samlCache(provider){
    return {
      async saveAsync(key,value){
        await db(`INSERT INTO identity_saml_request_cache(request_id,company_id,provider_id,value,expires_at)
          VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes')
          ON CONFLICT(request_id) DO UPDATE SET value=EXCLUDED.value,expires_at=EXCLUDED.expires_at`,[key,provider.company_id,provider.id,String(value)]);
        return value;
      },
      async getAsync(key){const r=await db("SELECT value FROM identity_saml_request_cache WHERE request_id=$1 AND provider_id=$2 AND expires_at>NOW()",[key,provider.id]);return r.rows[0]?.value||null;},
      async removeAsync(key){await db("DELETE FROM identity_saml_request_cache WHERE request_id=$1 AND provider_id=$2",[key,provider.id]);return key;},
      async consumeAsync(key){const r=await db("DELETE FROM identity_saml_request_cache WHERE request_id=$1 AND provider_id=$2 AND expires_at>NOW() RETURNING value",[key,provider.id]);return r.rows[0]?.value||null;},
    };
  }
  async function makeSaml(provider,req){
    const {SAML}=await import("@node-saml/node-saml");
    const cfg=provider.configuration||{};
    const callbackUrl=String(cfg.callbackUrl||`https://${String(req.headers?.["x-forwarded-host"]||req.headers?.host||"").split(",")[0]}/api/auth/provider/${encodeURIComponent(provider.provider_key)}/saml/acs`);
    return new SAML({
      callbackUrl,entryPoint:String(cfg.entryPoint||""),issuer:String(cfg.issuer||callbackUrl),
      idpCert:String(cfg.idpCert||""),wantAssertionsSigned:cfg.wantAssertionsSigned!==false,
      wantAuthnResponseSigned:cfg.wantAuthnResponseSigned===true,validateInResponseTo:"always",
      requestIdExpirationPeriodMs:600000,acceptedClockSkewMs:Number(cfg.acceptedClockSkewMs||5000),
      identifierFormat:cfg.identifierFormat||undefined,disableRequestedAuthnContext:cfg.disableRequestedAuthnContext===true,
      cacheProvider:samlCache(provider),
    });
  }

  router.get("/auth/provider/:key/saml/start",async(req,res)=>{
    const email=String(req.query?.email||"").trim().toLowerCase(),returnTo=safeReturnTo(req.query?.returnTo);
    try{
      const found=await loadProviderForEmail(db,email,req.params.key);if(!found||found.provider.provider_type!=="SAML")return res.redirect(providerErrorRedirect(returnTo,"provider_not_available"));
      const stateToken=crypto.randomBytes(32).toString("base64url");
      await db(`INSERT INTO identity_auth_provider_states(company_id,provider_id,state_token_hash,login_email,return_to,expires_at)
        VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '10 minutes')`,[found.provider.company_id,found.provider.id,hash(stateToken),email,returnTo]);
      const saml=await makeSaml(found.provider,req);
      return res.redirect(await saml.getAuthorizeUrlAsync(stateToken,{}));
    }catch(error){console.error("SAML start error",error);return res.redirect(providerErrorRedirect(returnTo,"provider_login_failed"));}
  });

  router.post("/auth/provider/:key/saml/acs",async(req,res)=>{
    const stateToken=String(req.body?.RelayState||"");let returnTo="https://onesolutions-ahuja.github.io/OneEngine/";
    try{
      const state=(await db(`SELECT s.*,p.*,s.id AS state_id,s.return_to AS auth_return_to,s.login_email AS auth_login_email
        FROM identity_auth_provider_states s JOIN identity_auth_providers p ON p.id=s.provider_id
        WHERE s.state_token_hash=$1 AND s.consumed_at IS NULL AND s.expires_at>NOW() AND p.provider_key=$2 AND p.provider_type='SAML' AND p.enabled=TRUE LIMIT 1`,
        [hash(stateToken),req.params.key])).rows[0];
      if(!state)return res.redirect(providerErrorRedirect(returnTo,"invalid_state"));
      returnTo=safeReturnTo(state.auth_return_to);
      const saml=await makeSaml(state,req);
      const validated=await saml.validatePostResponseAsync({SAMLResponse:String(req.body?.SAMLResponse||"")});
      const profile=validated?.profile;if(!profile)return res.redirect(providerErrorRedirect(returnTo,"saml_invalid"));
      const cfg=state.configuration||{};
      const email=String(profile[cfg.emailAttribute||"email"]||profile.email||profile.mail||profile.nameID||"").trim().toLowerCase();
      if(!email||email!==String(state.auth_login_email||"").toLowerCase())return res.redirect(providerErrorRedirect(returnTo,"account_not_linked"));
      await db("UPDATE identity_auth_provider_states SET consumed_at=NOW() WHERE id=$1",[state.state_id]);
      const level=String(profile.SessionLevel||profile.sessionLevel||"").toUpperCase();
      return completeProviderLogin(req,res,{provider:state,email,returnTo,authMethod:"SAML",assertedHighAssurance:level==="HIGH_ASSURANCE"||level==="HIGH"});
    }catch(error){console.error("SAML ACS error",error);return res.redirect(providerErrorRedirect(returnTo,"saml_invalid"));}
  });

  router.get("/auth/provider/:key/saml/metadata",async(req,res)=>{
    const p=await db("SELECT * FROM identity_auth_providers WHERE provider_key=$1 AND provider_type='SAML' AND enabled=TRUE LIMIT 1",[req.params.key]);
    if(!p.rows[0])return res.status(404).send("SAML provider not found");
    const saml=await makeSaml(p.rows[0],req);
    res.type("application/xml").send(saml.generateServiceProviderMetadata(null,null));
  });

  return router;
}
