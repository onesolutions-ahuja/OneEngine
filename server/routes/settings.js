import express from "express";
import { destinationFor, isValidLandingPage, normalizeDeviceProfile } from "../services/runtimeAccess.js";
import { normalizePlatformTheme } from "../src/utils/platformTheme.js";

async function hasPermission(db, roleId, code) {
  if (!roleId) return false;
  const result = await db(
    "SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.code=$2 LIMIT 1",
    [roleId, code]
  );
  return result.rows.length > 0;
}

export default function createSettingsRouter({ authenticate, authorize, db }) {
  const router = express.Router();

  router.get("/settings/runtime", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT cs.default_landing_page,cs.landing_flow,cs.platform_theme,
                r.default_landing_page AS role_default_landing_page,
                t.app_profile,up.preferences
           FROM users u
           LEFT JOIN company_settings cs ON cs.company_id=u.company_id
           LEFT JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id
           LEFT JOIN terminals t ON t.store_id=u.store_id AND t.active=TRUE
           LEFT JOIN user_preferences up ON up.user_id=u.id
          WHERE u.id=$1 AND u.company_id=$2
          ORDER BY t.created_at
          LIMIT 1`,
        [req.user.id,req.user.companyId]
      );
      const row=result.rows[0]||{};
      const preferences=row.preferences && typeof row.preferences==="object" ? row.preferences : {};
      res.json({success:true,data:{
        companyDefault:destinationFor(row.default_landing_page)?.key || "dashboard",
        roleDefault:destinationFor(row.role_default_landing_page)?.key || null,
        deviceProfile:normalizeDeviceProfile(row.app_profile),
        userOverride:destinationFor(preferences.landingPage)?.key || null,
        landingFlow:row.landing_flow && typeof row.landing_flow==="object" ? row.landing_flow : {rules:[],defaultDestination:"/app/dashboard"},
        platformTheme:normalizePlatformTheme(row.platform_theme),
      }});
    } catch (error) {
      console.error("Runtime settings load error:",error?.message||error);
      res.status(500).json({success:false,message:"Unable to load runtime settings"});
    }
  });

  router.put("/settings/runtime", authenticate, authorize("settings.manage"), async (req,res)=>{
    const {companyDefault,roleDefault,appProfile,landingFlow,platformTheme}=req.body||{};
    if(companyDefault!=null && !isValidLandingPage(companyDefault)) return res.status(400).json({success:false,message:"Invalid landing destination"});
    if(roleDefault!=null && !isValidLandingPage(roleDefault)) return res.status(400).json({success:false,message:"Invalid role landing destination"});
    if(platformTheme!==undefined && !(await hasPermission(db,req.user?.roleId,"oneengine.manage"))) {
      return res.status(403).json({success:false,message:"OneEngine management permission is required"});
    }
    const profile=normalizeDeviceProfile(appProfile);
    const nextTheme=normalizePlatformTheme(platformTheme);
    try {
      await db(
        `INSERT INTO company_settings(company_id,default_landing_page,platform_theme,updated_by,updated_at)
         VALUES($1,$2,$3,$4,NOW())
         ON CONFLICT(company_id) DO UPDATE SET
           default_landing_page=COALESCE(EXCLUDED.default_landing_page,company_settings.default_landing_page),
           platform_theme=COALESCE(EXCLUDED.platform_theme,company_settings.platform_theme),
           updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [req.user.companyId,companyDefault==null?null:destinationFor(companyDefault).key,platformTheme===undefined?null:nextTheme,req.user.id]
      );
      if(landingFlow!==undefined){
        const flow=landingFlow && typeof landingFlow==="object" && !Array.isArray(landingFlow) ? landingFlow : null;
        if(!flow || !Array.isArray(flow.rules)) return res.status(400).json({success:false,message:"Landing flow must contain rules"});
        await db("UPDATE company_settings SET landing_flow=$1::jsonb,updated_by=$2,updated_at=NOW() WHERE company_id=$3",[JSON.stringify(flow),req.user.id,req.user.companyId]);
      }
      if(roleDefault!==undefined) await db("UPDATE roles SET default_landing_page=$1 WHERE id=$2 AND company_id=$3",[roleDefault?destinationFor(roleDefault).key:null,req.user.roleId,req.user.companyId]);
      if(req.user.storeId && appProfile!==undefined) await db("UPDATE terminals SET app_profile=$1 WHERE store_id=$2 AND active=TRUE",[profile,req.user.storeId]);
      res.json({success:true,data:{companyDefault:companyDefault??null,roleDefault:roleDefault??null,appProfile:profile,landingFlow:landingFlow??undefined,platformTheme:nextTheme}});
    } catch(error){
      console.error("Runtime settings update error:",error?.message||error);
      res.status(500).json({success:false,message:"Unable to save runtime settings"});
    }
  });

  router.patch("/settings/runtime/user", authenticate, async(req,res)=>{
    const {landingPage}=req.body||{};
    if(landingPage!=null && !isValidLandingPage(landingPage)) return res.status(400).json({success:false,message:"Invalid landing destination"});
    try{
      const key=landingPage==null?null:destinationFor(landingPage).key;
      await db(
        `INSERT INTO user_preferences(user_id,preferences,updated_at)
         VALUES($1,jsonb_build_object('landingPage',$2::text),NOW())
         ON CONFLICT(user_id) DO UPDATE SET
           preferences=CASE WHEN $2::text IS NULL THEN user_preferences.preferences-'landingPage'
             ELSE jsonb_set(user_preferences.preferences,'{landingPage}',to_jsonb($2::text),TRUE) END,
           updated_at=NOW()`,
        [req.user.id,key]
      );
      res.json({success:true,data:{userOverride:key}});
    }catch(error){
      console.error("User runtime setting update error:",error?.message||error);
      res.status(500).json({success:false,message:"Unable to save user runtime setting"});
    }
  });

  return router;
}
