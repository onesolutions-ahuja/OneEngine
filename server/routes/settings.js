import express from "express";
import {
  JARVES_ALLOWANCE_RESULTS,
  getJarvesLicenceState,
  isJarvesEnabledForUser,
  normalizeJarvesAllowance,
  setJarvesAllowance,
} from "../services/jarvis/licensing.js";
import { destinationFor, isValidLandingPage, normalizeDeviceProfile } from "../services/runtimeAccess.js";
import { listPaymentMethods, ensureDefaultPaymentMethods, ensureConnectorPaymentMethods } from "../services/paymentMethods.js";
import { normalizePlatformTheme } from "../src/utils/platformTheme.js";
import { selectMetadataRecords, upsertMetadataRecord, updateMetadataRecords } from "../services/metadataRecordStore.js";

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

  const deviceKeyFor = (req) => {
    const raw = String(req.get('X-One-Device-Key') || '').trim()
    return /^[A-Za-z0-9._:-]{1,120}$/.test(raw) ? raw : 'device-local'
  };

  const claimLegacyHardware = async (req) => {
    const deviceKey = deviceKeyFor(req);
    const legacy = await selectMetadataRecords(db, {
      objectKey: "hardware_configuration",
      companyId: req.user.companyId,
      filters: { store_id: req.user.storeId, device_key: "legacy-unassigned" },
      columns: ["id"],
    });
    for (const row of legacy) {
      await updateMetadataRecords(db, {
        objectKey: "hardware_configuration",
        companyId: req.user.companyId,
        filters: { id: row.id },
        values: { device_key: deviceKey },
      });
    }
    return deviceKey;
  };

  const claimSingleLegacyPaymentTerminal = async (req) => {
    const deviceKey = deviceKeyFor(req);
    const rows = await selectMetadataRecords(db, {
      objectKey: "payment_terminal",
      companyId: req.user.companyId,
      filters: { store_id: req.user.storeId },
      columns: ["id","device_key","active"],
    });
    const linked = rows.filter((row) => row.active === true && row.device_key === deviceKey);
    const legacy = rows.filter((row) => row.active === true && row.device_key === "legacy-unassigned");
    if (!linked.length && legacy.length === 1) {
      await updateMetadataRecords(db, {
        objectKey: "payment_terminal",
        companyId: req.user.companyId,
        filters: { id: legacy[0].id },
        values: { device_key: deviceKey },
      });
    }
    return deviceKey;
  };

  router.get("/settings/payment-methods", authenticate, async (req, res) => {
    try {
      await ensureDefaultPaymentMethods(db, req.user.companyId);
      await ensureConnectorPaymentMethods(db, req.user.companyId, { storeId: req.user.storeId, tillId: req.user.tillId });
      res.json({ success: true, data: await listPaymentMethods(db, req.user.companyId, { activeOnly: false }) });
    } catch (error) {
      console.error("Payment methods load error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load payment methods" });
    }
  });


  router.get("/settings/runtime", authenticate, async (req, res) => {
    try {
      const [contextResult, settingsRows] = await Promise.all([
        db(
          `SELECT r.default_landing_page AS role_default_landing_page,
                  t.app_profile, up.preferences
             FROM users u
             LEFT JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id
             LEFT JOIN terminals t ON t.store_id=u.store_id AND t.active=true
             LEFT JOIN user_preferences up ON up.user_id=u.id
            WHERE u.id=$1 AND u.company_id=$2
            ORDER BY t.created_at
            LIMIT 1`,
          [req.user.id, req.user.companyId]
        ),
        selectMetadataRecords(db, { objectKey: "system_settings", companyId: req.user.companyId, limit: 1 }),
      ]);
      const row = { ...(settingsRows[0] || {}), ...(contextResult.rows[0] || {}) };
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
      await upsertMetadataRecord(db, {
        objectKey: "system_settings",
        companyId: req.user.companyId,
        match: { company_id: req.user.companyId },
        values: {
          default_landing_page: destinationFor(companyDefault).key,
          platform_theme: nextTheme,
          updated_by: req.user.id,
        },
      });
      if (landingFlow !== undefined) {
        const flow = landingFlow && typeof landingFlow === "object" && !Array.isArray(landingFlow) ? landingFlow : null;
        if (!flow || !Array.isArray(flow.rules)) return res.status(400).json({ success: false, message: "Landing flow must contain a rules array" });
        await updateMetadataRecords(db, {
          objectKey: "system_settings",
          companyId: req.user.companyId,
          values: { landing_flow: flow, updated_by: req.user.id },
        });
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
      const rows = await selectMetadataRecords(db, {
        objectKey: "system_settings",
        companyId: req.user.companyId,
        columns: ["jarves_behaviour_media"],
        limit: 1,
      });
      const defaults = { behaviour_1: "/jarves.mp4", behaviour_2: "/jarves.mp4", behaviour_3: "/jarves.mp4" };
      res.json({ success: true, data: { ...defaults, ...(rows[0]?.jarves_behaviour_media || {}) } });
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
      await upsertMetadataRecord(db, {
        objectKey: "system_settings",
        companyId: req.user.companyId,
        match: { company_id: req.user.companyId },
        values: { jarves_behaviour_media: media, updated_by: req.user.id },
      });
      res.json({ success: true, data: media });
    } catch (error) {
      console.error("JARVES behaviour settings update error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to save JARVES behaviour settings" });
    }
  });

  router.get("/settings", authenticate, async (req, res) => {
    try {
      const [companyResult, storeResult, settingsRows] = await Promise.all([
        db("SELECT id,name,legal_name,email,phone,currency,timezone,logo_url FROM companies WHERE id=$1 LIMIT 1", [req.user.companyId]),
        req.user.storeId
          ? db("SELECT id,name FROM stores WHERE id=$1 AND company_id=$2 LIMIT 1", [req.user.storeId, req.user.companyId])
          : Promise.resolve({ rows: [] }),
        selectMetadataRecords(db, { objectKey: "system_settings", companyId: req.user.companyId, limit: 1 }),
      ]);
      const company = companyResult.rows[0];
      if (!company) return res.status(404).json({ success: false, message: "Company settings not found" });
      const settings = settingsRows[0] || {};
      const store = storeResult.rows[0] || {};
      res.json({
        success: true,
        data: {
          company: { id: company.id, name: company.name, legalName: company.legal_name, email: company.email, phone: company.phone, currency: company.currency, timezone: company.timezone, logoUrl: company.logo_url || null },
          general: { dateFormat: settings.date_format || "DD/MM/YYYY" },
          tax: { vatEnabled: settings.vat_enabled ?? true, defaultVatRate: Number(settings.default_vat_rate ?? 20) },
          inventory: {
            allowNegativeInventoryBilling: settings.allow_negative_inventory_billing === true,
            batchInventoryMode: settings.batch_inventory_mode || "none",
            batchDefaultMfgRule: settings.batch_default_mfg_rule || "none",
            batchDefaultExpiryRule: settings.batch_default_expiry_rule || "none",
            batchDefaultExpiryDays: Number(settings.batch_default_expiry_days || 365),
          },
          loyalty: {
            enabled: settings.loyalty_enabled ?? false,
            earningRate: Number(settings.loyalty_earning_rate ?? 0.0100),
            minSaleTotal: settings.loyalty_min_sale_total == null ? null : Number(settings.loyalty_min_sale_total),
            redeemValuePerPoint: settings.loyalty_redeem_value_per_point == null ? null : Number(settings.loyalty_redeem_value_per_point),
            minPointsRedeem: settings.loyalty_min_points_redeem == null ? null : Number(settings.loyalty_min_points_redeem),
          },
          scanGo: { enabled: settings.scan_go_enabled ?? false },
          exchange: { mode: ["receipt","normal","both"].includes(settings.exchange_mode) ? settings.exchange_mode : "both" },
          till: { id: null, name: null, terminalNumber: null, productView: settings.product_view === "compact" ? "compact" : "image" },
          receiptQr: {
            showAfterSuccessfulPayment: ["OFF","ALWAYS","ONLY_WHEN_PRINTER_UNAVAILABLE"].includes(String(settings.receipt_qr_show_after_payment || "OFF").toUpperCase()) ? String(settings.receipt_qr_show_after_payment || "OFF").toUpperCase() : "OFF",
            expiryMinutes: Number.isFinite(Number(settings.receipt_qr_expiry_minutes)) ? Math.max(1, Number(settings.receipt_qr_expiry_minutes)) : 5,
            allowManualQr: settings.receipt_qr_allow_manual !== false,
            allowRegenerate: settings.receipt_qr_allow_regenerate !== false,
            autoCloseOnNewSale: settings.receipt_qr_auto_close_on_new_sale !== false,
            showCountdown: settings.receipt_qr_show_countdown !== false,
          },
          invoicePrefixes: { till: settings.till_invoice_prefix || "TO", delivery: settings.delivery_invoice_prefix || "DEL", selfCheckout: settings.self_checkout_invoice_prefix || "SC" },
          dock: { quickAccess: Array.isArray(settings.dock_quick_access) ? settings.dock_quick_access : [] },
          customerDisplay: { enabled: settings.customer_display_enabled === true },
          onlineOrdering: { enabled: settings.online_ordering_enabled ?? false, paymentMethods: Array.isArray(settings.online_payment_methods) ? settings.online_payment_methods : [] },
          store: { id: store.id || null, name: store.name || null },
        },
      });
    } catch (error) {
      console.error("Load settings error:", error);
      res.status(500).json({ success: false, message: "Unable to load settings" });
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

  /*
   * T10U — Negative Inventory Billing safety setting.
   * Admin/Owner control ONLY: gated by the existing settings.manage
   * permission (Administrator/Admin/Owner bypass applies unchanged via
   * authorize). Every change is audited with the previous value.
   */
  router.put("/settings/negative-inventory-billing", authenticate, authorize("settings.manage"), async (req, res) => {
    const enabled = req.body.enabled === true;
    if (enabled && req.body.acknowledged !== true) {
      return res.status(400).json({ success: false, message: "Enabling negative-inventory billing requires explicit acknowledgement of the warning" });
    }
    try {
      const rows = await selectMetadataRecords(db, {
        objectKey: "system_settings",
        companyId: req.user.companyId,
        columns: ["allow_negative_inventory_billing"],
        limit: 1,
      });
      const previousValue = rows[0]?.allow_negative_inventory_billing === true;
      if (previousValue === enabled) return res.json({ success: true, message: enabled ? "Already enabled" : "Already disabled", data: { enabled } });
      await upsertMetadataRecord(db, {
        objectKey: "system_settings",
        companyId: req.user.companyId,
        match: { company_id: req.user.companyId },
        values: { allow_negative_inventory_billing: enabled, updated_by: req.user.id },
      });
      await writeAudit?.(req.user.companyId, req.user.id, "inventory.negative_billing_setting", "company", req.user.companyId, { enabled, previousValue, storeId: req.user.storeId ?? null });
      res.json({ success: true, message: enabled ? "Negative-inventory billing enabled" : "Negative-inventory billing disabled", data: { enabled } });
    } catch (error) {
      console.error("Negative-inventory billing setting error:", error);
      res.status(500).json({ success: false, message: "Unable to update the setting" });
    }
  });

  /*
   * Batch inventory policy — canonical alias onto the settings patch model
   * (one save contract; the bespoke whole-row upsert was retired). Kept as
   * an endpoint so existing clients keep working; new code should PATCH
   * /api/settings with the batchInventory* fields directly.
   */
  /*
   * CANONICAL SETTINGS UPDATE COMMAND (merge-patch) — Phase 1 C-4.
   *
   * PATCH /api/settings accepts a PARTIAL settings model: every top-level
   * field is validated independently and omitted fields are left untouched
   * (no stale whole-form overwrite, no parent-form snapshot resend).
   * Company identity (name/legal/email/phone/logo) intentionally requires
   * the legacy whole-form PUT /api/settings below; this patch surface is
   * for field/section-safe configuration writes only.
   *
   * Concurrency: the UPDATE touches ONLY the columns present in the patch,
   * so two concurrent section saves cannot clobber each other's fields.
   * The loyalty fields carry the same entitlement gate as the legacy PUT.
   */
  const SETTINGS_PATCH_COLUMNS = {
    dateFormat: { column: "date_format", type: "string" },
    vatEnabled: { column: "vat_enabled", type: "boolean" },
    defaultVatRate: { column: "default_vat_rate", type: "vatRate" },
    allowNegativeInventoryBilling: { column: "allow_negative_inventory_billing", type: "negativeBilling" },
    productView: { column: "product_view", type: "productView" },
    dockQuickAccess: { column: "dock_quick_access", type: "dockQuickAccess" },
    customerDisplayEnabled: { column: "customer_display_enabled", type: "boolean" },
    onlineOrderingEnabled: { column: "online_ordering_enabled", type: "boolean" },
    onlinePaymentMethods: { column: "online_payment_methods", type: "paymentMethods" },
    tillInvoicePrefix: { column: "till_invoice_prefix", type: "invoicePrefix" },
    deliveryInvoicePrefix: { column: "delivery_invoice_prefix", type: "invoicePrefix" },
    selfCheckoutInvoicePrefix: { column: "self_checkout_invoice_prefix", type: "invoicePrefix" },
  };

  /* Sentinel distinguishing "invalid value" from a legitimate SQL NULL
     (loyalty redemption economics use null = "not configured"). */
  const SETTINGS_PATCH_INVALID = Symbol("settings_patch_invalid");

  const SETTINGS_PATCH_VALIDATORS = {
    string: (value) => (typeof value === "string" && value.trim() ? String(value).trim() : SETTINGS_PATCH_INVALID),
    boolean: (value) => (typeof value === "boolean" ? value : SETTINGS_PATCH_INVALID),
    vatRate: (value) => {
      const rate = Number(value);
      return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : SETTINGS_PATCH_INVALID;
    },
    nonNegativeNumber: (value) => {
      if (value === null) return null; /* null = "not configured" is valid */
      const num = Number(value);
      return Number.isFinite(num) && num >= 0 ? num : SETTINGS_PATCH_INVALID;
    },
    nonNegativeInteger: (value) => {
      if (value === null) return null;
      const num = Math.floor(Number(value));
      return Number.isFinite(num) && num >= 0 ? num : SETTINGS_PATCH_INVALID;
    },
    loyaltyEarningRate: (value) => {
      if (value === null) return null;
      const rate = Number(value);
      return Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : SETTINGS_PATCH_INVALID;
    },
    exchangeMode: (value) => (["receipt", "normal", "both"].includes(value) ? value : SETTINGS_PATCH_INVALID),
    batchMode: (value) => (["required_dates", "optional_dates", "none"].includes(value) ? value : SETTINGS_PATCH_INVALID),
    batchRule: (value) => (["none", "today", "today_plus_days"].includes(value) ? value : SETTINGS_PATCH_INVALID),
    batchDays: (value) => {
      const days = Math.floor(Number(value));
      return Number.isFinite(days) && days >= 0 && days <= 3650 ? days : SETTINGS_PATCH_INVALID;
    },
    productView: (value) => (["image", "compact"].includes(value) ? value : SETTINGS_PATCH_INVALID),
    paymentMethods: (value) => {
      if (!Array.isArray(value) || value.some((m) => !["card", "cash", "cod"].includes(m))) return SETTINGS_PATCH_INVALID;
      return JSON.stringify(value);
    },
    dockQuickAccess: (value) => {
      if (!Array.isArray(value) || value.length > 8 || new Set(value).size !== value.length) return SETTINGS_PATCH_INVALID;
      if (value.some((item) => typeof item !== "string" || !item.trim() || item.length > 120)) return SETTINGS_PATCH_INVALID;
      return JSON.stringify(value.map((item) => item.trim()));
    },
    invoicePrefix: (value) => {
      if (typeof value !== "string" || !/^[A-Za-z0-9]{1,10}$/.test(value.trim())) return SETTINGS_PATCH_INVALID;
      return value.trim().toUpperCase();
    },
    negativeBilling: (value, patch) => {
      /* T10U safety contract is preserved: enabling requires the explicit
         acknowledgement (same rule the dedicated endpoint enforced). */
      if (typeof value !== "boolean") return SETTINGS_PATCH_INVALID;
      if (value === true && patch && patch.acknowledged !== true) return SETTINGS_PATCH_INVALID;
      return value;
    },
  };

  router.patch("/settings", authenticate, authorize("settings.manage"), ...(requireLoyaltyEntitlement ? [requireLoyaltyEntitlement] : []), async (req, res) => {
    const patch = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
    if (!patch || Object.keys(patch).length === 0) {
      return res.status(400).json({ success: false, message: "A settings patch body is required" });
    }

    /* Field-level validation; unknown fields are rejected so a client that
       speaks the wrong contract fails loudly instead of silently dropping. */
    const patchedFields = [];
    const assignments = [];
    const values = [req.user.companyId];
    for (const [field, spec] of Object.entries(SETTINGS_PATCH_COLUMNS)) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
      const normalized = SETTINGS_PATCH_VALIDATORS[spec.type](patch[field], patch);
      if (normalized === SETTINGS_PATCH_INVALID) {
        return res.status(400).json({ success: false, message: `Invalid value for ${field}` });
      }
      values.push(normalized);
      patchedFields.push(spec.column);
      assignments.push(`${spec.column} = $${values.length}`);
    }
    const unknownFields = Object.keys(patch).filter((field) => !SETTINGS_PATCH_COLUMNS[field] && field !== "acknowledged");
    if (unknownFields.length) {
      return res.status(400).json({ success: false, message: `Unknown settings field(s): ${unknownFields.join(", ")}` });
    }
    if (!assignments.length) {
      return res.status(400).json({ success: false, message: "No configurable settings field was supplied" });
    }

    const metadataValues = {};
    for (const [field, spec] of Object.entries(SETTINGS_PATCH_COLUMNS)) {
      if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
      const normalized = SETTINGS_PATCH_VALIDATORS[spec.type](patch[field], patch);
      metadataValues[spec.column] = normalized;
    }
    try {
      await upsertMetadataRecord(db, {
        objectKey: "system_settings",
        companyId: req.user.companyId,
        match: { company_id: req.user.companyId },
        values: { ...metadataValues, updated_by: req.user.id },
      });
      await writeAudit?.(req.user.companyId, req.user.id, "settings.patched", "company", req.user.companyId, { fields: Object.keys(metadataValues) });
      res.json({ success: true, message: "Settings updated" });
    } catch (error) {
      console.error("Patch settings error:", error);
      res.status(500).json({ success: false, message: "Unable to update settings" });
    }
  });

  /* LEGACY whole-form settings save (company identity + full config form).
     Kept for the General/Company/Tax form and backward compatibility; new
     section cards must use the canonical PATCH command above. */
  router.put("/settings", authenticate, authorize("settings.manage"), ...(requireLoyaltyEntitlement ? [requireLoyaltyEntitlement] : []), async (req, res) => {
    const {
      companyName,
      legalName,
      companyEmail,
      companyPhone,
      currency,
      timezone,
      dateFormat,
      vatEnabled,
      defaultVatRate,
      loyaltyEnabled,
      loyaltyEarningRate,
      loyaltyMinSaleTotal,
      loyaltyRedeemValuePerPoint,
      loyaltyMinPointsRedeem,
      scanGoEnabled,
      exchangeMode,
      productView,
      dockQuickAccess,
      customerDisplayEnabled,
      onlineOrderingEnabled,
      onlinePaymentMethods,
      invoicePrefixes,
      batchInventoryMode,
      batchDefaultMfgRule,
      batchDefaultExpiryRule,
      batchDefaultExpiryDays,
      logoUrl = null,
    } = req.body;

    if (!companyName || !String(companyName).trim()) {
      return res.status(400).json({ success: false, message: "Company name is required" });
    }

    const vatRate = Number(defaultVatRate);
    if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      return res.status(400).json({ success: false, message: "VAT rate must be between 0 and 100" });
    }

    // Validate loyalty earning rate
    if (loyaltyEarningRate !== undefined && loyaltyEarningRate !== null) {
      const earningRate = Number(loyaltyEarningRate);
      if (!Number.isFinite(earningRate) || earningRate < 0 || earningRate > 1) {
        return res.status(400).json({ success: false, message: "Loyalty earning rate must be between 0 and 1 (0% to 100%)" });
      }
    }

    /* T10R: loyalty redemption economics + minimum qualifying sale.
     * Optional (null/omitted = not configured); normalised to numbers here
     * so the INSERT binds clean numerics. */
    let loyaltyMinSaleTotalNorm = null;
    if (loyaltyMinSaleTotal !== undefined && loyaltyMinSaleTotal !== null) {
      const minSale = Number(loyaltyMinSaleTotal);
      if (!Number.isFinite(minSale) || minSale < 0) {
        return res.status(400).json({ success: false, message: "Loyalty minimum sale total must be a non-negative number" });
      }
      loyaltyMinSaleTotalNorm = minSale;
    }
    let loyaltyRedeemValueNorm = null;
    if (loyaltyRedeemValuePerPoint !== undefined && loyaltyRedeemValuePerPoint !== null) {
      const redeemValue = Number(loyaltyRedeemValuePerPoint);
      if (!Number.isFinite(redeemValue) || redeemValue < 0) {
        return res.status(400).json({ success: false, message: "Loyalty redemption value per point must be a non-negative number" });
      }
      loyaltyRedeemValueNorm = redeemValue;
    }
    let loyaltyMinPointsNorm = null;
    if (loyaltyMinPointsRedeem !== undefined && loyaltyMinPointsRedeem !== null) {
      const minPoints = Math.floor(Number(loyaltyMinPointsRedeem));
      if (!Number.isFinite(minPoints) || minPoints < 0) {
        return res.status(400).json({ success: false, message: "Loyalty minimum points for redemption must be a non-negative integer" });
      }
      loyaltyMinPointsNorm = minPoints;
    }

    // Validate till product view (T10Q: image | compact; default image)
    if (productView !== undefined && productView !== null && !["image", "compact"].includes(productView)) {
      return res.status(400).json({ success: false, message: "Till product view must be 'image' or 'compact'" });
    }

    // Validate exchange mode (receipt | normal | both; default both)
    const EXCHANGE_MODES = ["receipt", "normal", "both"];
    const exchangeModeNorm = exchangeMode === undefined || exchangeMode === null
      ? undefined
      : String(exchangeMode).trim().toLowerCase();
    if (exchangeModeNorm !== undefined && !EXCHANGE_MODES.includes(exchangeModeNorm)) {
      return res.status(400).json({ success: false, message: "Exchange mode must be 'receipt', 'normal' or 'both'" });
    }
    const batchModes = ["required_dates", "optional_dates", "none"];
    const dateRules = ["none", "today", "today_plus_days"];
    if (batchInventoryMode !== undefined && !batchModes.includes(batchInventoryMode)) {
      return res.status(400).json({ success: false, message: "Invalid batch inventory mode" });
    }
    if (batchDefaultMfgRule !== undefined && !dateRules.includes(batchDefaultMfgRule)) {
      return res.status(400).json({ success: false, message: "Invalid default manufacturing date rule" });
    }
    if (batchDefaultExpiryRule !== undefined && !dateRules.includes(batchDefaultExpiryRule)) {
      return res.status(400).json({ success: false, message: "Invalid default expiry date rule" });
    }
    const batchDays = batchDefaultExpiryDays === undefined ? null : Math.floor(Number(batchDefaultExpiryDays));
    if (batchDays !== null && (!Number.isFinite(batchDays) || batchDays < 0 || batchDays > 3650)) {
      return res.status(400).json({ success: false, message: "Default expiry days must be between 0 and 3650" });
    }

    // Dock contents are metadata-owned. Settings only enforces the generic storage contract.
    if (dockQuickAccess !== undefined && dockQuickAccess !== null) {
      if (!Array.isArray(dockQuickAccess) || dockQuickAccess.length > 8 || new Set(dockQuickAccess).size !== dockQuickAccess.length ||
          dockQuickAccess.some((item) => typeof item !== "string" || !item.trim() || item.length > 120)) {
        return res.status(400).json({ success: false, message: "Dock quick access must contain up to 8 unique metadata keys" });
      }
    }

    // customerDisplayEnabled (Customer Display master switch): boolean only.
    if (customerDisplayEnabled !== undefined && customerDisplayEnabled !== null
        && typeof customerDisplayEnabled !== "boolean") {
      return res.status(400).json({ success: false, message: "customerDisplayEnabled must be a boolean" });
    }

    // Validate invoice prefixes (configurable receipt prefixes per sale
    // source): uppercase alphanumeric, 1-10 chars. null/undefined = keep.
    if (invoicePrefixes !== undefined && invoicePrefixes !== null) {
      if (typeof invoicePrefixes !== "object" || Array.isArray(invoicePrefixes)) {
        return res.status(400).json({ success: false, message: "invoicePrefixes must be an object" });
      }
      const prefixFields = ["till", "delivery", "selfCheckout"];
      for (const field of prefixFields) {
        const value = invoicePrefixes[field];
        if (value === undefined || value === null) continue;
        if (typeof value !== "string" || !/^[A-Za-z0-9]{1,10}$/.test(value.trim())) {
          return res.status(400).json({ success: false, message: `Invoice prefix for ${field} must be 1-10 letters/numbers` });
        }
      }
    }

    // Validate online payment methods
    if (onlinePaymentMethods !== undefined && onlinePaymentMethods !== null) {
      if (!Array.isArray(onlinePaymentMethods)) {
        return res.status(400).json({ success: false, message: "Online payment methods must be an array" });
      }
      const validMethods = ["card", "cash", "cod"];
      const invalidMethods = onlinePaymentMethods.filter((m) => !validMethods.includes(m));
      if (invalidMethods.length > 0) {
        return res.status(400).json({ success: false, message: `Invalid payment methods: ${invalidMethods.join(", ")}` });
      }
    }

    if (!pool) {
      return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE companies SET name = $1, legal_name = $2, email = $3, phone = $4, currency = $5, timezone = $6, logo_url = $7, updated_at = NOW() WHERE id = $8`,
        [String(companyName).trim(), legalName || null, companyEmail || null, companyPhone || null, currency || "GBP", timezone || "Europe/London", logoUrl || null, req.user.companyId]
      );
      /* COALESCE($6/$9/$10) in VALUES: those columns are NOT NULL with row
         defaults, and an INSERT ... VALUES clause may not reference existing
         row columns — that is what made every settings save fail with
         "column \"dock_quick_access\" does not exist" (HTTP 500). Omitted
         fields fall back to the column default on insert; the ON CONFLICT
         arm below keeps the stored value on update. */
      await upsertMetadataRecord((sql, params) => client.query(sql, params), {
        objectKey: "system_settings",
        companyId: req.user.companyId,
        match: { company_id: req.user.companyId },
        values: {
          date_format: dateFormat || "DD/MM/YYYY",
          vat_enabled: vatEnabled !== false,
          default_vat_rate: vatRate,
          loyalty_enabled: loyaltyEnabled !== false,
          loyalty_earning_rate: loyaltyEarningRate !== undefined ? loyaltyEarningRate : 0.0100,
          loyalty_min_sale_total: loyaltyMinSaleTotalNorm,
          loyalty_redeem_value_per_point: loyaltyRedeemValueNorm,
          loyalty_min_points_redeem: loyaltyMinPointsNorm,
          scan_go_enabled: scanGoEnabled === true,
          exchange_mode: exchangeModeNorm || "both",
          product_view: productView === "compact" ? "compact" : "image",
          dock_quick_access: Array.isArray(dockQuickAccess) ? dockQuickAccess : [],
          customer_display_enabled: typeof customerDisplayEnabled === "boolean" ? customerDisplayEnabled : false,
          online_ordering_enabled: onlineOrderingEnabled === true,
          online_payment_methods: Array.isArray(onlinePaymentMethods) ? onlinePaymentMethods : [],
          till_invoice_prefix: invoicePrefixes?.till?.trim?.().toUpperCase?.() || "TO",
          delivery_invoice_prefix: invoicePrefixes?.delivery?.trim?.().toUpperCase?.() || "DEL",
          self_checkout_invoice_prefix: invoicePrefixes?.selfCheckout?.trim?.().toUpperCase?.() || "SC",
          batch_inventory_mode: batchInventoryMode || "none",
          batch_default_mfg_rule: batchDefaultMfgRule || "none",
          batch_default_expiry_rule: batchDefaultExpiryRule || "none",
          batch_default_expiry_days: batchDays ?? 365,
          updated_by: req.user.id,
        },
      });
      await client.query(
        `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details) VALUES ($1,$2,'settings.updated','company',$1,$3)`,
        [req.user.companyId, req.user.id, JSON.stringify({ currency, timezone, dateFormat, vatEnabled, defaultVatRate: vatRate, loyaltyEnabled, loyaltyEarningRate, scanGoEnabled, productView, dockQuickAccess, customerDisplayEnabled, onlineOrderingEnabled, onlinePaymentMethods, invoicePrefixes })]
      );
      await client.query("COMMIT");
      res.json({ success: true, message: "Settings updated" });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Update settings error:", error);
      res.status(500).json({ success: false, message: "Unable to update settings" });
    } finally {
      client.release();
    }
  });

  router.get("/payment-terminals", authenticate, async (req, res) => {
    try {
      const deviceKey = await claimSingleLegacyPaymentTerminal(req);
      const rows = await selectMetadataRecords(db, { objectKey:"payment_terminal", companyId:req.user.companyId, filters:{store_id:req.user.storeId}, orderBy:{field:"name",direction:"ASC"} });
      res.json({success:true,data:rows.map(({api_credentials,...row})=>({...row,has_credentials:Boolean(api_credentials),linked_to_this_device:row.device_key===deviceKey,unassigned:row.device_key==="legacy-unassigned"}))});
    } catch(error) { console.error("Load payment terminals error:",error); res.status(500).json({success:false,message:"Unable to load payment terminals"}); }
  });

  router.post("/payment-terminals", authenticate, authorize("settings.manage"), async (req,res) => {
    const {provider,name,terminalIdentifier=null,connectionUrl=null,apiCredentials=null,storeId=null}=req.body;
    if(!provider||!name) return res.status(400).json({success:false,message:"Provider and terminal name are required"});
    try {
      const targetStoreId=storeId||req.user.storeId;
      if(!targetStoreId) return res.status(400).json({success:false,message:"Select a store before configuring a payment terminal"});
      const row=await upsertMetadataRecord(db,{objectKey:"payment_terminal",companyId:req.user.companyId,values:{
        company_id:req.user.companyId,store_id:targetStoreId,provider:String(provider).trim(),name:String(name).trim(),
        terminal_identifier:terminalIdentifier||null,connection_url:connectionUrl||null,api_credentials:apiCredentials||null,
        device_key:deviceKeyFor(req),active:true,
      }});
      await writeAudit?.(req.user.companyId,req.user.id,"payment_terminal.created","payment_terminal",row.id,{provider,name,deviceLinked:true});
      const {api_credentials,...safe}=row; res.status(201).json({success:true,message:"Payment terminal created and linked to this device",data:{...safe,linked_to_this_device:true,has_credentials:Boolean(api_credentials)}});
    } catch(error) { console.error("Create payment terminal error:",error); res.status(500).json({success:false,message:"Unable to create payment terminal"}); }
  });

  router.put("/payment-terminals/:id", authenticate, authorize("settings.manage"), async (req,res) => {
    const {provider,name,terminalIdentifier=null,connectionUrl=null,apiCredentials,active=true,linkToThisDevice=false}=req.body;
    try {
      const rows=await selectMetadataRecords(db,{objectKey:"payment_terminal",companyId:req.user.companyId,filters:{id:req.params.id},limit:1});
      const existing=rows[0]; if(!existing)return res.status(404).json({success:false,message:"Payment terminal not found"});
      if(String(existing.store_id)!==String(req.user.storeId||''))return res.status(403).json({success:false,message:"This terminal belongs to another store"});
      await updateMetadataRecords(db,{objectKey:"payment_terminal",companyId:req.user.companyId,filters:{id:req.params.id},values:{
        provider,name,terminal_identifier:terminalIdentifier||null,connection_url:connectionUrl||null,
        api_credentials:apiCredentials||existing.api_credentials||null,active:active!==false,
        device_key:linkToThisDevice?deviceKeyFor(req):existing.device_key,
      }});
      const row=(await selectMetadataRecords(db,{objectKey:"payment_terminal",companyId:req.user.companyId,filters:{id:req.params.id},limit:1}))[0];
      await writeAudit?.(req.user.companyId,req.user.id,"payment_terminal.updated","payment_terminal",req.params.id,{provider,name,active:active!==false,deviceLinked:linkToThisDevice||undefined});
      const {api_credentials,...safe}=row; res.json({success:true,message:linkToThisDevice?"Payment terminal linked to this device":"Payment terminal updated",data:{...safe,has_credentials:Boolean(api_credentials),linked_to_this_device:row.device_key===deviceKeyFor(req)}});
    } catch(error) { console.error("Update payment terminal error:",error); res.status(500).json({success:false,message:"Unable to update payment terminal"}); }
  });

  router.post("/payment-terminals/:id/test", authenticate, authorize("settings.manage"), async (req,res) => {
    try {
      const rows=await selectMetadataRecords(db,{objectKey:"payment_terminal",companyId:req.user.companyId,filters:{id:req.params.id,store_id:req.user.storeId,device_key:deviceKeyFor(req)},limit:1});
      if(!rows.length)return res.status(404).json({success:false,message:"Payment terminal is not linked to this device"});
      const test=await testPaymentTerminal(rows[0]);
      await updateMetadataRecords(db,{objectKey:"payment_terminal",companyId:req.user.companyId,filters:{id:req.params.id},values:{last_test_result:test.message,last_tested_at:new Date().toISOString()}});
      res.json({success:true,data:test});
    } catch(error) { console.error("Test payment terminal error:",error); res.status(500).json({success:false,message:"Unable to test payment terminal"}); }
  });

  router.get("/hardware", authenticate, async (req,res) => {
    try {
      const deviceKey=await claimLegacyHardware(req);
      const rows=await selectMetadataRecords(db,{objectKey:"hardware_configuration",companyId:req.user.companyId,filters:{store_id:req.user.storeId,device_key:deviceKey},orderBy:{field:"device_type"}});
      res.json({success:true,data:rows});
    } catch(error) { console.error("Load hardware error:",error); res.status(500).json({success:false,message:"Unable to load hardware configuration"}); }
  });

  router.put("/hardware", authenticate, authorize("settings.manage"), async (req,res) => {
    const {deviceType,deviceName=null,connectionType=null,connectionAddress=null,paperWidth=null,isDefault=false,active=false}=req.body;
    if(!["BARCODE_SCANNER","CASH_DRAWER","RECEIPT_PRINTER"].includes(deviceType))return res.status(400).json({success:false,message:"Invalid hardware type"});
    try {
      const deviceKey=await claimLegacyHardware(req);
      const row=await upsertMetadataRecord(db,{objectKey:"hardware_configuration",companyId:req.user.companyId,
        match:{company_id:req.user.companyId,store_id:req.user.storeId,device_key:deviceKey,device_type:deviceType},
        values:{company_id:req.user.companyId,store_id:req.user.storeId,device_key:deviceKey,device_type:deviceType,device_name:deviceName,connection_type:connectionType,connection_address:connectionAddress,paper_width:paperWidth,is_default:isDefault,active}});
      await writeAudit?.(req.user.companyId,req.user.id,"hardware.updated","hardware",row.id,{deviceType,connectionType,active,deviceLinked:true});
      res.json({success:true,message:"Hardware configuration updated for this device",data:row});
    } catch(error) { console.error("Update hardware error:",error); res.status(500).json({success:false,message:"Unable to update hardware configuration"}); }
  });

  router.post("/hardware/:type/test", authenticate, authorize("settings.manage"), async (req,res) => {
    const allowed=["BARCODE_SCANNER","CASH_DRAWER","RECEIPT_PRINTER"];
    if(!allowed.includes(req.params.type))return res.status(400).json({success:false,message:"Invalid hardware type"});
    const message="Live hardware probe is unavailable for this connection type";
    try {
      const rows=await selectMetadataRecords(db,{objectKey:"hardware_configuration",companyId:req.user.companyId,filters:{store_id:req.user.storeId,device_key:await claimLegacyHardware(req),device_type:req.params.type},columns:["id"],limit:1});
      if(rows[0]?.id)await updateMetadataRecords(db,{objectKey:"hardware_configuration",companyId:req.user.companyId,filters:{id:rows[0].id},values:{last_test_result:message,last_tested_at:new Date().toISOString()}});
      res.json({success:true,data:{status:"CONFIGURED",live:false,message}});
    } catch(error) { console.error("Test hardware error:",error); res.status(500).json({success:false,message:"Unable to test hardware"}); }
  });

  router.get("/health/devices", authenticate, async (req,res) => {
    try {
      const deviceKey=await claimLegacyHardware(req); await claimSingleLegacyPaymentTerminal(req);
      const [hardwareRows,terminalRows]=await Promise.all([
        selectMetadataRecords(db,{objectKey:"hardware_configuration",companyId:req.user.companyId,filters:{store_id:req.user.storeId,device_key:deviceKey,active:true},orderBy:{field:"device_type"}}),
        selectMetadataRecords(db,{objectKey:"payment_terminal",companyId:req.user.companyId,filters:{store_id:req.user.storeId,device_key:deviceKey,active:true},orderBy:{field:"name"}}),
      ]);
      const hardware=hardwareRows.map(row=>({id:`hardware:${row.id}`,kind:"hardware",deviceType:row.device_type,name:row.device_name||String(row.device_type||"Device").replaceAll("_"," "),status:"CONFIGURED",live:false,message:row.last_test_result||"Configured for this device; live probing is not supported by this connection.",checkedAt:row.last_tested_at||null}));
      const terminals=await Promise.all(terminalRows.map(async row=>{try{
        const probe=await testPaymentTerminal(row); const status=String(probe?.status||"UNKNOWN").toUpperCase(); const connected=["CONNECTED","READY","ONLINE","OK","SUCCESS"].includes(status);
        await updateMetadataRecords(db,{objectKey:"payment_terminal",companyId:req.user.companyId,filters:{id:row.id},values:{last_test_result:probe?.message||status,last_tested_at:new Date().toISOString()}});
        return {id:`terminal:${row.id}`,kind:"payment_terminal",deviceType:"PAYMENT_TERMINAL",name:row.name||row.provider||"Card terminal",status:connected?"CONNECTED":status,live:true,message:probe?.message||status,checkedAt:new Date().toISOString()};
      }catch(error){return {id:`terminal:${row.id}`,kind:"payment_terminal",deviceType:"PAYMENT_TERMINAL",name:row.name||row.provider||"Card terminal",status:"OFFLINE",live:true,message:error?.message||"Connection check failed",checkedAt:new Date().toISOString()};}}));
      res.json({success:true,data:[...hardware,...terminals]});
    } catch(error) { console.error("Device health error:",error); res.status(500).json({success:false,message:"Unable to load device health"}); }
  });

  router.get("/health/integrations", authenticate, async (req, res) => {
    let database = "Unavailable";
    try { await db("SELECT 1"); database = "Connected"; } catch { database = "Unavailable"; }
    const terminals = await selectMetadataRecords(db, { objectKey:"payment_terminal", companyId:req.user.companyId, filters:{active:true}, columns:["id"] });
    res.json({ success: true, data: { database, api: "Connected", paymentTerminal: terminals.length ? "Configured" : "Not configured", barcodeScanner: "Not configured", cashDrawer: "Not configured", receiptPrinter: "Not configured" } });
  });


  return router;
}
