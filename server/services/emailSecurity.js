export async function resolveSystemEmailSender(db,{companyId,requestedFrom=null}){
  const settings=(await db("SELECT * FROM email_deliverability_settings WHERE company_id=$1",[companyId])).rows[0]
    || {access_level:"ALL_EMAIL",require_verified_sender:true,use_substitute_for_unverified:false};
  if(settings.access_level==="NO_EMAIL")return {allowed:false,reason:"EMAIL_DELIVERY_DISABLED"};

  const requested=String(requestedFrom||"").trim().toLowerCase();
  if(requested){
    const match=(await db(`SELECT id,email,verified,active,purpose FROM organization_email_addresses
      WHERE company_id=$1 AND LOWER(email)=LOWER($2) AND active=TRUE LIMIT 1`,[companyId,requested])).rows[0];
    if(match&&(!settings.require_verified_sender||match.verified===true))return {allowed:true,email:match.email,address:match};
    if(!settings.require_verified_sender)return {allowed:true,email:requested,address:null};
  }

  if(settings.no_reply_address_id){
    const fallback=(await db(`SELECT id,email,verified,active,purpose FROM organization_email_addresses
      WHERE id=$1 AND company_id=$2 AND active=TRUE LIMIT 1`,[settings.no_reply_address_id,companyId])).rows[0];
    if(fallback&&(!settings.require_verified_sender||fallback.verified===true))return {allowed:true,email:fallback.email,address:fallback,substituted:true};
  }

  if(settings.require_verified_sender)return {allowed:false,reason:"VERIFIED_SENDER_REQUIRED"};
  return {allowed:true,email:requested||null,address:null};
}

export async function emailAddressAllowedForRole(db,{companyId,roleId,addressId}){
  const address=(await db("SELECT * FROM organization_email_addresses WHERE id=$1 AND company_id=$2 AND active=TRUE",[addressId,companyId])).rows[0];
  if(!address)return false;
  if(address.allow_all_users===true)return true;
  if(!roleId)return false;
  const access=await db("SELECT 1 FROM organization_email_role_access WHERE email_address_id=$1 AND role_id=$2 AND company_id=$3 LIMIT 1",[addressId,roleId,companyId]);
  return access.rows.length>0;
}
