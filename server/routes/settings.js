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

export default function createSettingsRouter({
  authenticate,
  authorize,
  db,
  pool,
  writeAudit,
  testPaymentTerminal,
  requireLoyaltyEntitlement = null,
}) {
  const router = express.Router();

  router.get("/settings/runtime", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT cs.default_landing_page, cs.landing_flow, cs.platform_theme, r.default_landing_page AS role_default_landing_page,
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
          landingFlow: row.landing_flow && typeof row.landing_flow === "object" ? row.landing_flow : { rules: [], defaultDestination: "/app/dashboard" },
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
    if (platformTheme !== undefined) {
      if (!(await hasOneEngineManagePermission(db, req.user?.roleId))) {
        return res.status(403).json({ success: false, message: "OneEngine Manager permission is required to change the OneEngine theme" });
      }
    }
    if (!isValidLandingPage(companyDefault) || (roleDefault != null && !isValidLandingPage(roleDefault))) {
      return res.status(400).json({ success: false, message: "Landing page must be a permitted runtime destination" });
    }
    const profile = normalizeDeviceProfile(appProfile);
    const nextTheme = normalizePlatformTheme(platformTheme);
    try {
      await db(
        `INSERT INTO company_settings (company_id, default_landing_page, platform_theme, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (company_id) DO UPDATE SET default_landing_page=$2, platform_theme=$3, updated_by=$4, updated_at=NOW()`,
        [req.user.companyId, destinationFor(companyDefault).key, nextTheme, req.user.id]
      );
      if (landingFlow !== undefined) {
        const flow = landingFlow && typeof landingFlow === "object" && !Array.isArray(landingFlow) ? landingFlow : null;
        if (!flow || !Array.isArray(flow.rules)) return res.status(400).json({ success: false, message: "Landing flow must contain a rules array" });
        await db("UPDATE company_settings SET landing_flow=$1::jsonb, updated_by=$2, updated_at=NOW() WHERE company_id=$3", [JSON.stringify(flow), req.user.id, req.user.companyId]);
      }
      if (roleDefault !== undefined) {
        await db("UPDATE roles SET default_landing_page=$1 WHERE id=$2 AND company_id=$3", [roleDefault ? destinationFor(roleDefault).key : null, req.user.roleId, req.user.companyId]);
      }
      if (req.user.storeId) {
        await db("UPDATE terminals SET app_profile=$1 WHERE store_id=$2 AND active=true", [profile, req.user.storeId]);
      }
      res.json({ success: true, data: { companyDefault, roleDefault: roleDefault || null, appProfile: profile, landingFlow: landingFlow ?? undefined, platformTheme: nextTheme } });
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
        `INSERT INTO user_preferences (user_id, preferences, updated_at)
         VALUES ($1, jsonb_build_object('landingPage', $2::text), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           preferences=CASE WHEN $2::text IS NULL THEN user_preferences.preferences - 'landingPage'
                            ELSE jsonb_set(user_preferences.preferences, '{landingPage}', to_jsonb($2::text), true) END,
           updated_at=NOW()`,
        [req.user.id, landingPage == null ? null : destinationFor(landingPage).key]
      );
      res.json({ success: true, data: { userOverride: landingPage == null ? null : destinationFor(landingPage).key } });
    } catch (error) {
      console.error("User runtime setting update error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to save user runtime setting" });
    }
  });

  /*
   * JARVES licence control (see services/jarvis/licensing.js).
   *
   *   GET /api/settings/jarves  - licence state for the caller's company
   *                               (settings.manage OR user.view: the users
   *                               admin page uses it to show seat usage).
   *   PUT /api/settings/jarves  - set the company allowance (settings.manage).
   *
   * Refusing to lower the allowance below the enabled count guarantees
   * existing JARVES users are never silently disabled.
   */
  router.get("/settings/jarves", authenticate, authorize("settings.manage", "user.view"), async (req, res) => {
    try {
      const state = await getJarvesLicenceState(db, req.user.companyId);
      const enabledForMe = await isJarvesEnabledForUser(db, {
        userId: req.user.id,
        companyId: req.user.companyId,
      });
      res.json({ success: true, data: { ...state, enabledForMe } });
    } catch (error) {
      console.error("JARVES licence state error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load JARVES licence state" });
    }
  });

  router.put("/settings/jarves", authenticate, authorize("settings.manage"), async (req, res) => {
    try {
      if (normalizeJarvesAllowance(req.body?.allowance) == null) {
        return res.status(400).json({ success: false, message: "A whole-number \"allowance\" between 0 and 10000 is required" });
      }
      const result = await setJarvesAllowance(db, req.user.companyId, req.body.allowance, req.user.id);
      if (result === JARVES_ALLOWANCE_RESULTS.ALLOWANCE_BELOW_ENABLED) {
        const state = await getJarvesLicenceState(db, req.user.companyId);
        return res.status(409).json({
          success: false,
          code: "jarves_allowance_below_enabled",
          message: `Cannot set the allowance below the number of users already enabled (${state.enabledUsers}). Disable JARVES for some users first - no user is disabled automatically.`,
        });
      }
      const state = await getJarvesLicenceState(db, req.user.companyId);
      res.json({ success: true, message: "JARVES licence updated", data: state });
    } catch (error) {
      console.error("JARVES licence update error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to save JARVES licence" });
    }
  });

  router.get("/settings/jarves/behaviours", authenticate, authorize("settings.manage", "user.view"), async (req, res) => {
    try {
      const result = await db("SELECT jarves_behaviour_media FROM company_settings WHERE company_id=$1", [req.user.companyId]);
      const defaults = { behaviour_1: "/jarves.mp4", behaviour_2: "/jarves.mp4", behaviour_3: "/jarves.mp4" };
      res.json({ success: true, data: { ...defaults, ...(result.rows[0]?.jarves_behaviour_media || {}) } });
    } catch (error) {
      console.error("JARVES behaviour settings error:", error?.message || error);
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
      await db(`INSERT INTO company_settings (company_id, jarves_behaviour_media, updated_by, updated_at) VALUES ($1,$2::jsonb,$3,NOW())
        ON CONFLICT (company_id) DO UPDATE SET jarves_behaviour_media=$2::jsonb, updated_by=$3, updated_at=NOW()`, [req.user.companyId, JSON.stringify(media), req.user.id]);
      res.json({ success: true, data: media });
    } catch (error) {
      console.error("JARVES behaviour settings update error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to save JARVES behaviour settings" });
    }
  });

  /*
   * Company identity/regional partial update used by the migrated Settings UI.
   * Keeps company-table fields out of the company_settings merge-patch and
   * avoids the legacy whole-form PUT overwriting unrelated configuration.
   */
  router.patch("/settings/company", authenticate, authorize("settings.manage"), async (req, res) => {
    const patch = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    const allowed = {
      name: "name",
      legalName: "legal_name",
      email: "email",
      phone: "phone",
      currency: "currency",
      timezone: "timezone",
      logoUrl: "logo_url",
    };
    if (!patch || !Object.keys(patch).length) {
      return res.status(400).json({ success: false, message: "A company settings patch body is required" });
    }
    const unknown = Object.keys(patch).filter((field) => !allowed[field]);
    if (unknown.length) {
      return res.status(400).json({ success: false, message: `Unknown company settings field(s): ${unknown.join(", ")}` });
    }
    if (Object.prototype.hasOwnProperty.call(patch, "name") && !String(patch.name || "").trim()) {
      return res.status(400).json({ success: false, message: "Company name is required" });
    }

    const assignments = [];
    const values = [];
    for (const [field, column] of Object.entries(allowed)) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
      const raw = patch[field];
      const normalized = field === "name"
        ? String(raw || "").trim()
        : raw == null || String(raw).trim() === "" ? null : String(raw).trim();
      values.push(normalized);
      assignments.push(`${column}=${values.length}`);
    }
    values.push(req.user.companyId);

    try {
      const result = await db(
        `UPDATE companies SET ${assignments.join(", ")}, updated_at=NOW() WHERE id=${values.length} RETURNING id,name,legal_name,email,phone,currency,timezone,logo_url`,
        values
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Company not found" });
      if (writeAudit) {
        await writeAudit(
          req.user.companyId,
          req.user.id,
          "settings.company_patched",
          "company",
          req.user.companyId,
          { fields: Object.keys(patch) }
        );
      }
      const row = result.rows[0];
      res.json({ success: true, data: {
        id: row.id,
        name: row.name,
        legalName: row.legal_name,
        email: row.email,
        phone: row.phone,
        currency: row.currency,
        timezone: row.timezone,
        logoUrl: row.logo_url,
      } });
    } catch (error) {
      console.error("Patch company settings error:", error);
      res.status(500).json({ success: false, message: "Unable to update company settings" });
    }
  });



  return router;
}
