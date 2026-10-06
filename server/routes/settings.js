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
    const deviceKey = deviceKeyFor(req)
    await db(
      `UPDATE hardware_devices
          SET device_key=$1,updated_at=NOW()
        WHERE company_id=$2 AND store_id=$3 AND device_key='legacy-unassigned'`,
      [deviceKey, req.user.companyId, req.user.storeId]
    );
    return deviceKey
  };

  const claimSingleLegacyPaymentTerminal = async (req) => {
    const deviceKey = deviceKeyFor(req)
    const existing = await db(
      `SELECT
          COUNT(*) FILTER (WHERE device_key=$3 AND active=true)::int AS linked_count,
          COUNT(*) FILTER (WHERE device_key='legacy-unassigned' AND active=true)::int AS legacy_count,
          (ARRAY_AGG(id ORDER BY id) FILTER (WHERE device_key='legacy-unassigned' AND active=true))[1] AS legacy_id
         FROM payment_terminals
        WHERE company_id=$1 AND store_id=$2`,
      [req.user.companyId, req.user.storeId, deviceKey]
    );
    const row = existing.rows[0] || {};
    if (Number(row.linked_count) === 0 && Number(row.legacy_count) === 1 && row.legacy_id) {
      await db(
        "UPDATE payment_terminals SET device_key=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 AND store_id=$4 AND device_key='legacy-unassigned'",
        [deviceKey,row.legacy_id,req.user.companyId,req.user.storeId]
      );
    }
    return deviceKey
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

  router.get("/settings", authenticate, async (req, res) => {
    try {
      const result = await db(
        `
        SELECT
          c.id AS company_id, c.name AS company_name, c.legal_name, c.email AS company_email, c.phone AS company_phone, c.currency, c.timezone, c.logo_url,
          cs.date_format, cs.vat_enabled, cs.default_vat_rate, cs.loyalty_enabled, cs.loyalty_earning_rate,
          cs.loyalty_min_sale_total, cs.loyalty_redeem_value_per_point, cs.loyalty_min_points_redeem,
          cs.allow_negative_inventory_billing,
          cs.batch_inventory_mode, cs.batch_default_mfg_rule, cs.batch_default_expiry_rule, cs.batch_default_expiry_days,
          cs.scan_go_enabled, cs.exchange_mode, cs.online_ordering_enabled, cs.online_payment_methods,
          cs.product_view, cs.dock_quick_access,
          cs.customer_display_enabled,
          s.id AS store_id, s.name AS store_name,
          NULL::uuid AS till_id, NULL::text AS till_name, NULL::text AS terminal_number
        FROM companies c
        LEFT JOIN company_settings cs ON cs.company_id = c.id
        LEFT JOIN stores s ON s.id = $2 AND s.company_id = c.id
        WHERE c.id = $1
        LIMIT 1
        `,
        [req.user.companyId, req.user.storeId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ success: false, message: "Company settings not found" });
      }

      const settings = result.rows[0];
      res.json({
        success: true,
        data: {
          company: {
            id: settings.company_id,
            name: settings.company_name,
            legalName: settings.legal_name,
            email: settings.company_email,
            phone: settings.company_phone,
            currency: settings.currency,
            timezone: settings.timezone,
            logoUrl: settings.logo_url || null,
          },
          general: {
            dateFormat: settings.date_format || "DD/MM/YYYY",
          },
          tax: {
            vatEnabled: settings.vat_enabled ?? true,
            defaultVatRate: Number(settings.default_vat_rate ?? 20),
          },
          inventory: {
            /* T10U: negative-inventory billing safety — OFF unless explicitly enabled. */
            allowNegativeInventoryBilling: settings.allow_negative_inventory_billing === true,
            batchInventoryMode: settings.batch_inventory_mode || "none",
            batchDefaultMfgRule: settings.batch_default_mfg_rule || "none",
            batchDefaultExpiryRule: settings.batch_default_expiry_rule || "none",
            batchDefaultExpiryDays: Number(settings.batch_default_expiry_days || 365),
          },
          loyalty: {
            enabled: settings.loyalty_enabled ?? false,
            earningRate: Number(settings.loyalty_earning_rate ?? 0.0100),
            /* T10R: redemption economics + minimum qualifying sale.
             * null = feature not configured (redemption UI must treat a
             * null redeem value as "redemption not configured"). */
            minSaleTotal: settings.loyalty_min_sale_total == null ? null : Number(settings.loyalty_min_sale_total),
            redeemValuePerPoint: settings.loyalty_redeem_value_per_point == null ? null : Number(settings.loyalty_redeem_value_per_point),
            minPointsRedeem: settings.loyalty_min_points_redeem == null ? null : Number(settings.loyalty_min_points_redeem),
          },
          scanGo: {
            enabled: settings.scan_go_enabled ?? false,
          },
          exchange: {
            /* receipt | normal | both (default). The till Exchange workflow
               and metadata Validation Rules / Flows enforce this server-side. */
            mode: ["receipt", "normal", "both"].includes(settings.exchange_mode)
              ? settings.exchange_mode
              : "both",
          },
          till: {
            id: settings.till_id,
            name: settings.till_name,
            terminalNumber: settings.terminal_number,
            /* Till product browser presentation: 'image' | 'compact'. */
            productView: settings.product_view === "compact" ? "compact" : "image",
          },
          receiptQr: {
            showAfterSuccessfulPayment: ["OFF", "ALWAYS", "ONLY_WHEN_PRINTER_UNAVAILABLE"].includes(String(settings.receipt_qr_show_after_payment || "OFF").toUpperCase())
              ? String(settings.receipt_qr_show_after_payment || "OFF").trim().toUpperCase()
              : "OFF",
            expiryMinutes: Number.isFinite(Number(settings.receipt_qr_expiry_minutes)) ? Math.max(1, Number(settings.receipt_qr_expiry_minutes)) : 5,
            allowManualQr: settings.receipt_qr_allow_manual !== false,
            allowRegenerate: settings.receipt_qr_allow_regenerate !== false,
            autoCloseOnNewSale: settings.receipt_qr_auto_close_on_new_sale !== false,
            showCountdown: settings.receipt_qr_show_countdown !== false,
          },
          /* Configurable sale invoice/receipt prefixes per sale source.
             Defaults TO / DEL / SC; till + self-checkout receipts keep the
             existing PREFIX-YYYYMMDD-NNNN sequencing, delivery receipts
             become PREFIX-<platform external order id>. */
          invoicePrefixes: {
            till: settings.till_invoice_prefix || "TO",
            delivery: settings.delivery_invoice_prefix || "DEL",
            selfCheckout: settings.self_checkout_invoice_prefix || "SC",
          },
          /* Admin dock quick-access (T10W): pages shown directly on the
             bottom bar. Ordered; validated on save; launcher always shows
             every permitted page regardless of this list. */
          dock: {
            quickAccess: Array.isArray(settings.dock_quick_access)
              ? settings.dock_quick_access
              : ["Dashboard", "Sales", "Products", "Inventory", "Customers", "Reports"],
          },
          /* Customer Display (second monitor): master ON/OFF. When OFF the
             till shows no entry point and the /customer-display page refuses
             to connect. */
          customerDisplay: {
            enabled: settings.customer_display_enabled === true,
          },
          onlineOrdering: {
            enabled: settings.online_ordering_enabled ?? false,
            paymentMethods: Array.isArray(settings.online_payment_methods) ? settings.online_payment_methods : ["card", "cash", "cod"],
          },
          store: {
            id: settings.store_id,
            name: settings.store_name,
          },
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
    if (!pool) {
      return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    }

    /* Strong confirmation: an enabling request must carry the exact
       acknowledgement string (the settings UI shows the same warning). */
    if (enabled && req.body.acknowledged !== true) {
      return res.status(400).json({
        success: false,
        message: "Enabling negative-inventory billing requires explicit acknowledgement of the warning",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        "SELECT allow_negative_inventory_billing FROM company_settings WHERE company_id=$1 FOR UPDATE",
        [req.user.companyId]
      );
      const previousValue = previous.rows.length ? previous.rows[0].allow_negative_inventory_billing === true : false;

      if (previousValue === enabled) {
        await client.query("COMMIT");
        return res.json({ success: true, message: enabled ? "Already enabled" : "Already disabled", data: { enabled } });
      }

      await client.query(
        `
        INSERT INTO company_settings (company_id, allow_negative_inventory_billing, updated_by, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (company_id) DO UPDATE SET
          allow_negative_inventory_billing = $2, updated_by = $3, updated_at = NOW()
        `,
        [req.user.companyId, enabled, req.user.id]
      );

      /* Audit: setting change (previous + new value, who, when). */
      await client.query(
        `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
         VALUES ($1,$2,'inventory.negative_billing_setting','company',$1,$3)`,
        [
          req.user.companyId,
          req.user.id,
          JSON.stringify({ enabled, previousValue, storeId: req.user.storeId ?? null }),
        ]
      );

      await client.query("COMMIT");
      res.json({ success: true, message: enabled ? "Negative-inventory billing enabled" : "Negative-inventory billing disabled", data: { enabled } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Negative-inventory billing setting error:", error);
      res.status(500).json({ success: false, message: "Unable to update the setting" });
    } finally {
      client.release();
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

    if (!pool) {
      return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      /* Upsert so a company without a settings row yet is seeded with column
         defaults + the patched fields; ON CONFLICT touches ONLY the patched
         columns, so concurrent section saves cannot clobber each other. */
      await client.query(
        `INSERT INTO company_settings (company_id, ${patchedFields.join(", ")}, updated_by, updated_at)
         VALUES ($1, ${patchedFields.map((_, index) => `$${index + 2}`).join(", ")}, $${values.length + 1}, NOW())
         ON CONFLICT (company_id) DO UPDATE SET ${assignments.join(", ")}, updated_by = $${values.length + 1}, updated_at = NOW()`,
        [...values, req.user.id]
      );
      await client.query(
        `INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details) VALUES ($1,$2,'settings.patched','company',$1,$3)`,
        [req.user.companyId, req.user.id, JSON.stringify({ fields: Object.keys(patch).filter((f) => SETTINGS_PATCH_COLUMNS[f]) })]
      );
      await client.query("COMMIT");
      res.json({ success: true, message: "Settings updated" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Patch settings error:", error);
      res.status(500).json({ success: false, message: "Unable to update settings" });
    } finally {
      client.release();
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
      await client.query(
        `
        INSERT INTO company_settings (company_id, date_format, vat_enabled, default_vat_rate, loyalty_enabled, loyalty_earning_rate, loyalty_min_sale_total, loyalty_redeem_value_per_point, loyalty_min_points_redeem, scan_go_enabled, exchange_mode, product_view, dock_quick_access, customer_display_enabled, online_ordering_enabled, online_payment_methods, till_invoice_prefix, delivery_invoice_prefix, self_checkout_invoice_prefix, updated_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6, 0.0100),$7::numeric,$8::numeric,$9::integer,$10,COALESCE($11, 'both'),COALESCE($12, 'image'),COALESCE($13::jsonb, '["Dashboard", "Sales", "Products", "Inventory", "Customers", "Reports"]'::jsonb),COALESCE($14, false),$15,COALESCE($16::jsonb, '["card", "cash", "cod"]'::jsonb),COALESCE($17,'TO'),COALESCE($18,'DEL'),COALESCE($19,'SC'),$20,NOW())
        ON CONFLICT (company_id) DO UPDATE SET date_format=$2, vat_enabled=$3, default_vat_rate=$4, loyalty_enabled=$5, loyalty_earning_rate=COALESCE($6, company_settings.loyalty_earning_rate), loyalty_min_sale_total=COALESCE($7::numeric, company_settings.loyalty_min_sale_total), loyalty_redeem_value_per_point=COALESCE($8::numeric, company_settings.loyalty_redeem_value_per_point), loyalty_min_points_redeem=COALESCE($9::integer, company_settings.loyalty_min_points_redeem), scan_go_enabled=$10, exchange_mode=COALESCE($11, company_settings.exchange_mode), product_view=COALESCE($12, company_settings.product_view), dock_quick_access=COALESCE($13::jsonb, company_settings.dock_quick_access), customer_display_enabled=COALESCE($14, company_settings.customer_display_enabled), online_ordering_enabled=$15, online_payment_methods=COALESCE($16::jsonb, company_settings.online_payment_methods), till_invoice_prefix=COALESCE($17, company_settings.till_invoice_prefix), delivery_invoice_prefix=COALESCE($18, company_settings.delivery_invoice_prefix), self_checkout_invoice_prefix=COALESCE($19, company_settings.self_checkout_invoice_prefix), updated_by=$20, updated_at=NOW()
        `,
        [
          req.user.companyId,
          dateFormat || "DD/MM/YYYY",
          vatEnabled !== false,
          vatRate,
          loyaltyEnabled !== false,
          loyaltyEarningRate !== undefined ? loyaltyEarningRate : null,
          loyaltyMinSaleTotalNorm,
          loyaltyRedeemValueNorm,
          loyaltyMinPointsNorm,
          scanGoEnabled === true,
          exchangeModeNorm || null,
          productView === "compact" ? "compact" : productView === "image" ? "image" : null,
          Array.isArray(dockQuickAccess) ? JSON.stringify(dockQuickAccess) : null,
          typeof customerDisplayEnabled === "boolean" ? customerDisplayEnabled : null,
          onlineOrderingEnabled === true,
          onlinePaymentMethods !== undefined ? JSON.stringify(onlinePaymentMethods) : null,
          /* Invoice prefixes: per-source objects only; null = keep existing. */
          invoicePrefixes && typeof invoicePrefixes === "object" && !Array.isArray(invoicePrefixes)
            ? (typeof invoicePrefixes.till === "string" ? invoicePrefixes.till.trim().toUpperCase() : null)
            : null,
          invoicePrefixes && typeof invoicePrefixes === "object" && !Array.isArray(invoicePrefixes)
            ? (typeof invoicePrefixes.delivery === "string" ? invoicePrefixes.delivery.trim().toUpperCase() : null)
            : null,
          invoicePrefixes && typeof invoicePrefixes === "object" && !Array.isArray(invoicePrefixes)
            ? (typeof invoicePrefixes.selfCheckout === "string" ? invoicePrefixes.selfCheckout.trim().toUpperCase() : null)
            : null,
          req.user.id
        ]
      );
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
      const result = await db(
        `SELECT id,store_id,provider,name,terminal_identifier,connection_url,
                active,(api_credentials IS NOT NULL AND api_credentials <> '') AS has_credentials,
                last_test_result,last_tested_at,created_at,updated_at,
                (device_key=$3) AS linked_to_this_device,
                (device_key='legacy-unassigned') AS unassigned
           FROM payment_terminals
          WHERE company_id=$1 AND store_id=$2
          ORDER BY linked_to_this_device DESC,active DESC,name`,
        [req.user.companyId, req.user.storeId, deviceKey]
      );
      res.json({success:true,data:result.rows});
    } catch(error) {
      console.error("Load payment terminals error:",error);
      res.status(500).json({success:false,message:"Unable to load payment terminals"});
    }
  });

  router.post("/payment-terminals", authenticate, authorize("settings.manage"), async (req,res) => {
    const {provider,name,terminalIdentifier=null,connectionUrl=null,apiCredentials=null,storeId=null}=req.body;
    if(!provider||!name) return res.status(400).json({success:false,message:"Provider and terminal name are required"});
    try {
      const targetStoreId=storeId||req.user.storeId;
      if(!targetStoreId) return res.status(400).json({success:false,message:"Select a store before configuring a payment terminal"});
      const deviceKey=deviceKeyFor(req);
      const result=await db(
        `INSERT INTO payment_terminals (company_id,store_id,provider,name,terminal_identifier,connection_url,api_credentials,device_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id,store_id,provider,name,terminal_identifier,connection_url,active,TRUE AS linked_to_this_device`,
        [req.user.companyId,targetStoreId,String(provider).trim(),String(name).trim(),terminalIdentifier||null,connectionUrl||null,apiCredentials||null,deviceKey]
      );
      await writeAudit(req.user.companyId,req.user.id,"payment_terminal.created","payment_terminal",result.rows[0].id,{provider,name,deviceLinked:true});
      res.status(201).json({success:true,message:"Payment terminal created and linked to this device",data:result.rows[0]});
    } catch(error) {
      console.error("Create payment terminal error:",error);
      res.status(500).json({success:false,message:"Unable to create payment terminal"});
    }
  });

  router.put("/payment-terminals/:id", authenticate, authorize("settings.manage"), async (req,res) => {
    const {provider,name,terminalIdentifier=null,connectionUrl=null,apiCredentials,active=true,linkToThisDevice=false}=req.body;
    try {
      const existing=await db("SELECT api_credentials,device_key,store_id FROM payment_terminals WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId]);
      if(!existing.rows.length) return res.status(404).json({success:false,message:"Payment terminal not found"});
      if(String(existing.rows[0].store_id)!==String(req.user.storeId||'')) return res.status(403).json({success:false,message:"This terminal belongs to another store"});
      const credentials=apiCredentials?apiCredentials:existing.rows[0].api_credentials;
      const deviceKey=linkToThisDevice?deviceKeyFor(req):existing.rows[0].device_key;
      const result=await db(
        `UPDATE payment_terminals
            SET provider=$1,name=$2,terminal_identifier=$3,connection_url=$4,api_credentials=$5,active=$6,device_key=$7,updated_at=NOW()
          WHERE id=$8 AND company_id=$9
          RETURNING id,store_id,provider,name,terminal_identifier,connection_url,active,
                    (api_credentials IS NOT NULL AND api_credentials <> '') AS has_credentials,
                    (device_key=$7) AS linked_to_this_device`,
        [provider,name,terminalIdentifier||null,connectionUrl||null,credentials,active!==false,deviceKey,req.params.id,req.user.companyId]
      );
      await writeAudit(req.user.companyId,req.user.id,"payment_terminal.updated","payment_terminal",req.params.id,{provider,name,active:active!==false,deviceLinked:linkToThisDevice||undefined});
      res.json({success:true,message:linkToThisDevice?"Payment terminal linked to this device":"Payment terminal updated",data:result.rows[0]});
    } catch(error) {
      console.error("Update payment terminal error:",error);
      res.status(500).json({success:false,message:"Unable to update payment terminal"});
    }
  });

  router.post("/payment-terminals/:id/test", authenticate, authorize("settings.manage"), async (req,res) => {
    try {
      const deviceKey=deviceKeyFor(req);
      const result=await db("SELECT * FROM payment_terminals WHERE id=$1 AND company_id=$2 AND store_id=$3 AND device_key=$4",[req.params.id,req.user.companyId,req.user.storeId,deviceKey]);
      if(!result.rows.length) return res.status(404).json({success:false,message:"Payment terminal is not linked to this device"});
      const test=await testPaymentTerminal(result.rows[0]);
      await db("UPDATE payment_terminals SET last_test_result=$1,last_tested_at=NOW() WHERE id=$2 AND company_id=$3",[test.message,req.params.id,req.user.companyId]);
      res.json({success:true,data:test});
    } catch(error) {
      console.error("Test payment terminal error:",error);
      res.status(500).json({success:false,message:"Unable to test payment terminal"});
    }
  });

  router.get("/hardware", authenticate, async (req,res) => {
    try {
      const deviceKey=await claimLegacyHardware(req);
      const result=await db(
        `SELECT id,store_id,device_type,device_name,connection_type,connection_address,paper_width,is_default,active,last_test_result,last_tested_at
           FROM hardware_devices
          WHERE company_id=$1 AND store_id=$2 AND device_key=$3
          ORDER BY device_type`,
        [req.user.companyId,req.user.storeId,deviceKey]
      );
      res.json({success:true,data:result.rows});
    } catch(error) {
      console.error("Load hardware error:",error);
      res.status(500).json({success:false,message:"Unable to load hardware configuration"});
    }
  });

  router.put("/hardware", authenticate, authorize("settings.manage"), async (req,res) => {
    const {deviceType,deviceName=null,connectionType=null,connectionAddress=null,paperWidth=null,isDefault=false,active=false}=req.body;
    if(!["BARCODE_SCANNER","CASH_DRAWER","RECEIPT_PRINTER"].includes(deviceType)) return res.status(400).json({success:false,message:"Invalid hardware type"});
    try {
      const deviceKey=await claimLegacyHardware(req);
      const result=await db(
        `INSERT INTO hardware_devices (company_id,store_id,device_key,device_type,device_name,connection_type,connection_address,paper_width,is_default,active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (company_id,store_id,device_key,device_type)
         DO UPDATE SET device_name=$5,connection_type=$6,connection_address=$7,paper_width=$8,is_default=$9,active=$10,updated_at=NOW()
         RETURNING id,store_id,device_type,device_name,connection_type,connection_address,paper_width,is_default,active,last_test_result,last_tested_at`,
        [req.user.companyId,req.user.storeId,deviceKey,deviceType,deviceName,connectionType,connectionAddress,paperWidth,isDefault,active]
      );
      await writeAudit(req.user.companyId,req.user.id,"hardware.updated","hardware",result.rows[0].id,{deviceType,connectionType,active,deviceLinked:true});
      res.json({success:true,message:"Hardware configuration updated for this device",data:result.rows[0]});
    } catch(error) {
      console.error("Update hardware error:",error);
      res.status(500).json({success:false,message:"Unable to update hardware configuration"});
    }
  });

  router.post("/hardware/:type/test", authenticate, authorize("settings.manage"), async (req,res) => {
    const allowed=["BARCODE_SCANNER","CASH_DRAWER","RECEIPT_PRINTER"];
    if(!allowed.includes(req.params.type)) return res.status(400).json({success:false,message:"Invalid hardware type"});
    const message="Live hardware probe is unavailable for this connection type";
    try {
      const deviceKey=await claimLegacyHardware(req);
      const result=await db("SELECT id FROM hardware_devices WHERE company_id=$1 AND store_id=$2 AND device_key=$3 AND device_type=$4",[req.user.companyId,req.user.storeId,deviceKey,req.params.type]);
      if(result.rows.length) await db("UPDATE hardware_devices SET last_test_result=$1,last_tested_at=NOW() WHERE id=$2",[message,result.rows[0].id]);
      res.json({success:true,data:{status:"CONFIGURED",live:false,message}});
    } catch(error) {
      console.error("Test hardware error:",error);
      res.status(500).json({success:false,message:"Unable to test hardware"});
    }
  });

  router.get("/health/devices", authenticate, async (req,res) => {
    try {
      const deviceKey=await claimLegacyHardware(req);
      await claimSingleLegacyPaymentTerminal(req);
      const [hardwareResult,terminalResult]=await Promise.all([
        db(`SELECT id,device_type,device_name,connection_type,last_test_result,last_tested_at
              FROM hardware_devices
             WHERE company_id=$1 AND store_id=$2 AND device_key=$3 AND active=true
             ORDER BY device_type`,[req.user.companyId,req.user.storeId,deviceKey]),
        db(`SELECT * FROM payment_terminals
             WHERE company_id=$1 AND store_id=$2 AND device_key=$3 AND active=true
             ORDER BY name`,[req.user.companyId,req.user.storeId,deviceKey]),
      ]);
      const hardware=hardwareResult.rows.map(row=>({
        id:`hardware:${row.id}`,kind:"hardware",deviceType:row.device_type,
        name:row.device_name||String(row.device_type||"Device").replaceAll("_"," "),
        status:"CONFIGURED",live:false,
        message:row.last_test_result||"Configured for this device; live probing is not supported by this connection.",
        checkedAt:row.last_tested_at||null,
      }));
      const terminals=await Promise.all(terminalResult.rows.map(async row=>{
        try {
          const probe=await testPaymentTerminal(row);
          const status=String(probe?.status||"UNKNOWN").toUpperCase();
          const connected=["CONNECTED","READY","ONLINE","OK","SUCCESS"].includes(status);
          await db("UPDATE payment_terminals SET last_test_result=$1,last_tested_at=NOW() WHERE id=$2 AND company_id=$3",[probe?.message||status,row.id,req.user.companyId]);
          return {id:`terminal:${row.id}`,kind:"payment_terminal",deviceType:"PAYMENT_TERMINAL",name:row.name||row.provider||"Card terminal",status:connected?"CONNECTED":status,live:true,message:probe?.message||status,checkedAt:new Date().toISOString()};
        } catch(error) {
          return {id:`terminal:${row.id}`,kind:"payment_terminal",deviceType:"PAYMENT_TERMINAL",name:row.name||row.provider||"Card terminal",status:"OFFLINE",live:true,message:error?.message||"Connection check failed",checkedAt:new Date().toISOString()};
        }
      }));
      res.json({success:true,data:[...hardware,...terminals]});
    } catch(error) {
      console.error("Device health error:",error);
      res.status(500).json({success:false,message:"Unable to load device health"});
    }
  });

  router.get("/health/integrations", authenticate, async (req, res) => {
    let database = "Unavailable";
    try { await db("SELECT 1"); database = "Connected"; } catch { database = "Unavailable"; }
    const terminals = await db("SELECT COUNT(*)::int AS count FROM payment_terminals WHERE company_id=$1 AND active=true", [req.user.companyId]);
    res.json({ success: true, data: { database, api: "Connected", paymentTerminal: terminals.rows[0].count ? "Configured" : "Not configured", barcodeScanner: "Not configured", cashDrawer: "Not configured", receiptPrinter: "Not configured" } });
  });


  return router;
}
