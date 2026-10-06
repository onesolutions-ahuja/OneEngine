import express from "express";
import { listPaymentMethods } from "../services/paymentMethods.js";
import { destinationFor, normalizeDeviceProfile } from "../services/runtimeAccess.js";
import { normalizePlatformTheme } from "../src/utils/platformTheme.js";

const metadataRequired=(_req,res)=>res.status(410).json({success:false,code:"METADATA_ACTION_REQUIRED",message:"Legacy Settings mutations execute through metadata Actions/Flows and generic record writes."});
const deviceKeyFor=(req)=>{const raw=String(req.get("X-One-Device-Key")||"").trim();return /^[A-Za-z0-9._:-]{1,120}$/.test(raw)?raw:"device-local";};

export default function createSettingsRouter({authenticate,authorize,db}){
  const router=express.Router();
  router.get("/settings/payment-methods",authenticate,async(req,res)=>{
    try{return res.json({success:true,data:await listPaymentMethods(db,req.user.companyId,{activeOnly:false})});}
    catch(error){return res.status(500).json({success:false,message:"Unable to load payment methods"});}
  });
  router.get("/settings/runtime",authenticate,async(req,res)=>{
    try{
      const result=await db(`SELECT cs.default_landing_page,cs.landing_flow,cs.platform_theme,r.default_landing_page AS role_default_landing_page,t.app_profile,up.preferences FROM users u LEFT JOIN company_settings cs ON cs.company_id=u.company_id LEFT JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id LEFT JOIN terminals t ON t.store_id=u.store_id AND t.active=true LEFT JOIN user_preferences up ON up.user_id=u.id WHERE u.id=$1 AND u.company_id=$2 ORDER BY t.created_at LIMIT 1`,[req.user.id,req.user.companyId]);
      const row=result.rows[0]||{},preferences=row.preferences&&typeof row.preferences==="object"?row.preferences:{};
      return res.json({success:true,data:{companyDefault:destinationFor(row.default_landing_page)?.key||"dashboard",roleDefault:destinationFor(row.role_default_landing_page)?.key||null,deviceProfile:normalizeDeviceProfile(row.app_profile),userOverride:destinationFor(preferences.landingPage)?.key||null,landingFlow:row.landing_flow&&typeof row.landing_flow==="object"?row.landing_flow:{rules:[],defaultDestination:"/app/dashboard"},platformTheme:normalizePlatformTheme(row.platform_theme)}});
    }catch(error){return res.status(500).json({success:false,message:"Unable to load runtime settings"});}
  });
  router.get("/settings",authenticate,async(req,res)=>{
    try{
      const [company,settings]=await Promise.all([db("SELECT id,name,legal_name,email,phone,currency,timezone,logo_url FROM companies WHERE id=$1 LIMIT 1",[req.user.companyId]),db("SELECT * FROM company_settings WHERE company_id=$1 LIMIT 1",[req.user.companyId])]);
      return res.json({success:true,data:{company:company.rows[0]||null,settings:settings.rows[0]||{}}});
    }catch(error){return res.status(500).json({success:false,message:"Unable to load settings"});}
  });
  router.get("/payment-terminals",authenticate,async(req,res)=>{
    try{const key=deviceKeyFor(req);const result=await db("SELECT id,company_id,store_id,provider,name,terminal_identifier,connection_url,device_key,active,last_test_result,last_tested_at FROM payment_terminals WHERE company_id=$1 AND ($2::uuid IS NULL OR store_id=$2) AND (device_key=$3 OR device_key='legacy-unassigned') ORDER BY name",[req.user.companyId,req.user.storeId||null,key]);return res.json({success:true,data:result.rows});}
    catch(error){return res.status(500).json({success:false,message:"Unable to load payment terminals"});}
  });
  router.get("/hardware",authenticate,async(req,res)=>{
    try{const key=deviceKeyFor(req);const result=await db("SELECT * FROM hardware_configurations WHERE company_id=$1 AND ($2::uuid IS NULL OR store_id=$2) AND (device_key=$3 OR device_key='legacy-unassigned') ORDER BY device_type,device_name",[req.user.companyId,req.user.storeId||null,key]);return res.json({success:true,data:result.rows});}
    catch(error){return res.status(500).json({success:false,message:"Unable to load hardware"});}
  });
  router.get("/health/devices",authenticate,async(req,res)=>{
    try{const [terminals,hardware]=await Promise.all([db("SELECT id,name,provider,active,last_test_result,last_tested_at FROM payment_terminals WHERE company_id=$1 AND ($2::uuid IS NULL OR store_id=$2)",[req.user.companyId,req.user.storeId||null]),db("SELECT id,device_type,device_name,active,last_test_result,last_tested_at FROM hardware_configurations WHERE company_id=$1 AND ($2::uuid IS NULL OR store_id=$2)",[req.user.companyId,req.user.storeId||null])]);return res.json({success:true,data:{paymentTerminals:terminals.rows,hardware:hardware.rows}});}
    catch(error){return res.status(500).json({success:false,message:"Unable to load device health"});}
  });
  router.get("/health/integrations",authenticate,async(req,res)=>{
    try{const result=await db("SELECT id,name,provider_name,integration_type,enabled,connection_status,last_connected_at,last_error,updated_at FROM integration_connections WHERE company_id=$1 ORDER BY name",[req.user.companyId]);return res.json({success:true,data:result.rows});}
    catch(error){return res.status(500).json({success:false,message:"Unable to load integration health"});}
  });
  for(const path of ["/settings/runtime","/settings/jarves","/settings/jarves/behaviours","/settings/company","/settings/negative-inventory-billing","/settings","/payment-terminals","/hardware"]) router.put(path,authenticate,authorize("settings.manage"),metadataRequired);
  router.patch("/settings/runtime/user",authenticate,metadataRequired);
  router.patch("/settings/company",authenticate,authorize("settings.manage"),metadataRequired);
  router.patch("/settings",authenticate,authorize("settings.manage"),metadataRequired);
  router.post("/payment-terminals",authenticate,authorize("settings.manage"),metadataRequired);
  router.put("/payment-terminals/:id",authenticate,authorize("settings.manage"),metadataRequired);
  router.post("/payment-terminals/:id/test",authenticate,authorize("settings.manage"),metadataRequired);
  router.post("/hardware/:type/test",authenticate,authorize("settings.manage"),metadataRequired);
  return router;
}
