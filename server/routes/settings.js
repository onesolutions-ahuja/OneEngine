import express from "express";
import {
  JARVES_ALLOWANCE_RESULTS,
  getJarvesLicenceState,
  isJarvesEnabledForUser,
  normalizeJarvesAllowance,
  setJarvesAllowance,
} from "../services/jarvis/licensing.js";
import { destinationFor, isValidLandingPage, normalizeDeviceProfile } from "../services/runtimeAccess.js";
import { normalizePlatformTheme } from "../src/utils/platformTheme.js";

export default function createSettingsRouter({ authenticate, authorize, db }) {
  const router = express.Router();

  router.get("/settings/runtime", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT cs.default_landing_page, cs.landing_flow, cs.platform_theme,
                r.default_landing_page AS role_default_landing_page,
                t.app_profile, up.preferences
           FROM users u
           LEFT JOIN company_settings cs ON cs.company_id=u.company_id
           LEFT JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id
           LEFT JOIN terminals t ON t.store_id=u.store_id AND t.active=true
           LEFT JOIN user_preferences up ON up.user_id=u.id
          WHERE u.id=$1 AND u.company_id=$2
          ORDER BY t.created_at
          LIMIT 1`,
        [req.user.id, req.user.companyId]
      );
      const row = result.rows[0] || {};
      const preferences = row.preferences && typeof row.preferences === "object" ? row.preferences : {};
      res.json({
        success: true,
        data: {
          companyDefault: destinationFor(row.default_landing_page)?.key || "dashboard",
          roleDefault: destinationFor(row.role_default_landing_page)?.key || null,
          deviceProfile: normalizeDeviceProfile(row.app_profile),
          userOverride: destinationFor(preferences.landingPage)?.key || null,
          landingFlow: row.landing_flow && typeof row.landing_flow === "object"
            ? row.landing_flow
            : { rules: [], defaultDestination: "/app/dashboard" },
          platformTheme: normalizePlatformTheme(row.platform_theme),
        },
      });
    } catch (error) {
      console.error("Runtime settings load error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load runtime settings" });
    }
  });

  router.put("/settings/runtime", authenticate, authorize("settings.manage"), async (req, res) => {
    const { companyDefault, roleDefault, appProfile, landingFlow, platformTheme } = req.body || {};
    if (!isValidLandingPage(companyDefault) || (roleDefault != null && !isValidLandingPage(roleDefault))) {
      return res.status(400).json({ success: false, message: "Landing page must be a permitted runtime destination" });
    }
    const profile = normalizeDeviceProfile(appProfile);
    const nextTheme = normalizePlatformTheme(platformTheme);
    if (landingFlow !== undefined) {
      const flow = landingFlow && typeof landingFlow === "object" && !Array.isArray(landingFlow) ? landingFlow : null;
      if (!flow || !Array.isArray(flow.rules)) {
        return res.status(400).json({ success: false, message: "Landing flow must contain a rules array" });
      }
    }
    try {
      await db(
        `INSERT INTO company_settings (company_id,default_landing_page,platform_theme,landing_flow,updated_by,updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,NOW())
         ON CONFLICT (company_id) DO UPDATE SET
           default_landing_page=EXCLUDED.default_landing_page,
           platform_theme=EXCLUDED.platform_theme,
           landing_flow=CASE WHEN $6::boolean THEN EXCLUDED.landing_flow ELSE company_settings.landing_flow END,
           updated_by=EXCLUDED.updated_by,
           updated_at=NOW()`,
        [
          req.user.companyId,
          destinationFor(companyDefault).key,
          nextTheme,
          JSON.stringify(landingFlow ?? { rules: [], defaultDestination: "/app/dashboard" }),
          req.user.id,
          landingFlow !== undefined,
        ]
      );
      if (roleDefault !== undefined) {
        await db(
          "UPDATE roles SET default_landing_page=$1 WHERE id=$2 AND company_id=$3",
          [roleDefault ? destinationFor(roleDefault).key : null, req.user.roleId, req.user.companyId]
        );
      }
      if (req.user.storeId) {
        await db("UPDATE terminals SET app_profile=$1 WHERE store_id=$2 AND active=true", [profile, req.user.storeId]);
      }
      res.json({
        success: true,
        data: {
          companyDefault: destinationFor(companyDefault).key,
          roleDefault: roleDefault == null ? null : destinationFor(roleDefault).key,
          appProfile: profile,
          landingFlow: landingFlow ?? undefined,
          platformTheme: nextTheme,
        },
      });
    } catch (error) {
      console.error("Runtime settings update error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to save runtime settings" });
    }
  });

  router.patch("/settings/runtime/user", authenticate, async (req, res) => {
    const { landingPage } = req.body || {};
    if (landingPage != null && !isValidLandingPage(landingPage)) {
      return res.status(400).json({ success: false, message: "Landing page must be a permitted runtime destination" });
    }
    try {
      await db(
        `INSERT INTO user_preferences (user_id,preferences,updated_at)
         VALUES ($1,jsonb_build_object('landingPage',$2::text),NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           preferences=CASE WHEN $2::text IS NULL THEN user_preferences.preferences - 'landingPage'
                            ELSE jsonb_set(user_preferences.preferences,'{landingPage}',to_jsonb($2::text),true) END,
           updated_at=NOW()`,
        [req.user.id, landingPage == null ? null : destinationFor(landingPage).key]
      );
      res.json({ success: true, data: { userOverride: landingPage == null ? null : destinationFor(landingPage).key } });
    } catch (error) {
      console.error("User runtime setting update error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to save user runtime setting" });
    }
  });

  router.get("/settings/jarves", authenticate, authorize("settings.manage", "user.view"), async (req, res) => {
    try {
      const state = await getJarvesLicenceState(db, req.user.companyId);
      const enabledForMe = await isJarvesEnabledForUser(db, { userId: req.user.id, companyId: req.user.companyId });
      res.json({ success: true, data: { ...state, enabledForMe } });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load JARVES licence state" });
    }
  });

  router.put("/settings/jarves", authenticate, authorize("settings.manage"), async (req, res) => {
    try {
      if (normalizeJarvesAllowance(req.body?.allowance) == null) {
        return res.status(400).json({ success: false, message: "A whole-number allowance between 0 and 10000 is required" });
      }
      const result = await setJarvesAllowance(db, req.user.companyId, req.body.allowance, req.user.id);
      if (result === JARVES_ALLOWANCE_RESULTS.ALLOWANCE_BELOW_ENABLED) {
        const state = await getJarvesLicenceState(db, req.user.companyId);
        return res.status(409).json({ success: false, code: "jarves_allowance_below_enabled", data: state });
      }
      res.json({ success: true, data: await getJarvesLicenceState(db, req.user.companyId) });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to save JARVES licence" });
    }
  });

  router.get("/settings/jarves/behaviours", authenticate, authorize("settings.manage", "user.view"), async (req, res) => {
    try {
      const result = await db("SELECT jarves_behaviour_media FROM company_settings WHERE company_id=$1", [req.user.companyId]);
      const defaults = { behaviour_1: "/jarves.mp4", behaviour_2: "/jarves.mp4", behaviour_3: "/jarves.mp4" };
      res.json({ success: true, data: { ...defaults, ...(result.rows[0]?.jarves_behaviour_media || {}) } });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load JARVES behaviour settings" });
    }
  });

  router.put("/settings/jarves/behaviours", authenticate, authorize("settings.manage"), async (req, res) => {
    try {
      const keys = ["behaviour_1", "behaviour_2", "behaviour_3"];
      const media = Object.fromEntries(keys.map((key) => [key, String(req.body?.[key] || "/jarves.mp4").trim()]));
      if (Object.values(media).some((value) => !value.startsWith("/") && !/^https:\/\//i.test(value))) {
        return res.status(400).json({ success: false, message: "JARVES media must be an app path or HTTPS URL" });
      }
      await db(
        `INSERT INTO company_settings (company_id,jarves_behaviour_media,updated_by,updated_at)
         VALUES ($1,$2::jsonb,$3,NOW())
         ON CONFLICT (company_id) DO UPDATE SET jarves_behaviour_media=EXCLUDED.jarves_behaviour_media,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [req.user.companyId, JSON.stringify(media), req.user.id]
      );
      res.json({ success: true, data: media });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to save JARVES behaviour settings" });
    }
  });

  return router;
}
