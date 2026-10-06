// Settings navigation is persistent metadata. The runtime only reads and filters metadata rows.
export async function buildSettingsCatalog(db,{companyId,permissions=[]}={}){
 if(!db||!companyId)return{groups:[],sections:[]};
 const result=await db(`SELECT metadata_type,metadata_key,label,description,display_order,configuration FROM platform_navigation_metadata WHERE company_id=$1 AND active=TRUE AND metadata_type IN ('SETTINGS_GROUP','SETTINGS_SECTION') ORDER BY display_order,label`,[companyId]);
 const codes=new Set(Array.isArray(permissions)?permissions:[]);
 const allowed=(row)=>{const required=Array.isArray(row.configuration?.requiredPermissions)?row.configuration.requiredPermissions:[];return required.length===0||required.some(code=>codes.has(code));};
 const rows=(result.rows||[]).filter(allowed);
 return{groups:rows.filter(r=>r.metadata_type==="SETTINGS_GROUP").map(r=>({key:r.metadata_key,label:r.label,order:r.display_order,...(r.configuration||{})})),sections:rows.filter(r=>r.metadata_type==="SETTINGS_SECTION").map(r=>({key:r.metadata_key,label:r.label,description:r.description,order:r.display_order,...(r.configuration||{})}))};
}
