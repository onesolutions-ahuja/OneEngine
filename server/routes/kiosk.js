import express from "express";
import jwt from "jsonwebtoken";
import { resolvePrice } from "../services/pricingEngine.js";

const KIOSK_MODE_TTL = process.env.KIOSK_MODE_TTL || "12h";

/*
 * OneKiosk fulfilment bridge.
 *
 * Payment and stock remain authoritative in the normal Sales engine. After a
 * successful kiosk sale, this route creates a provider-neutral fulfilment
 * record from the committed sale WITHOUT reserving/deducting stock again.
 */
export default function createKioskRouter({
  authenticate,
  authorize,
  db,
  pool,
  writeAudit,
  jwtSecret = process.env.JWT_SECRET,
  modeTtl = KIOSK_MODE_TTL,
}) {
  const router = express.Router();

  const normaliseHealth = (value) => {
    const key = String(value || "UNKNOWN").trim().toUpperCase();
    return ["ONLINE","OFFLINE","DEGRADED","READY","ERROR","NOT_CONFIGURED","UNKNOWN"].includes(key) ? key : "UNKNOWN";
  };

  router.post("/kiosk/device-session", authenticate, authorize("sale.create"), async (req, res) => {
    const deviceKey = String(req.body?.deviceKey || "").trim();
    if (!deviceKey) return res.status(400).json({ success: false, message: "Kiosk device key is required" });
    try {
      const result = await db(
        `SELECT kd.id,kd.company_id,kd.store_id,kd.device_key,kd.name,kd.payment_connector_id,
                ic.till_id
           FROM kiosk_devices kd
           LEFT JOIN integration_connections ic
             ON ic.id=kd.payment_connector_id AND ic.company_id=kd.company_id
          WHERE kd.company_id=$1 AND kd.store_id=$2 AND kd.device_key=$3 AND kd.active=TRUE
          LIMIT 1`,
        [req.user.companyId, req.user.storeId, deviceKey]
      );
      const device = result.rows[0];
      if (!device) return res.status(404).json({ success: false, message: "Kiosk device is not registered or is disabled" });
      const modeToken = jwt.sign(
        {
          id: req.user.id,
          companyId: req.user.companyId,
          storeId: req.user.storeId,
          roleId: req.user.roleId,
          username: req.user.username,
          mode: "kiosk",
          kioskDeviceId: device.id,
          kioskDeviceKey: device.device_key,
          tillId: device.till_id || null,
        },
        jwtSecret,
        { expiresIn: modeTtl }
      );
      await writeAudit?.(req.user.companyId, req.user.id, "KIOSK_DEVICE_SESSION_STARTED", "kiosk_device", device.id, {
        storeId: req.user.storeId,
        tillId: device.till_id || null,
      });
      res.status(201).json({
        success: true,
        data: {
          modeToken,
          device: { id: device.id, key: device.device_key, name: device.name },
          mode: "kiosk",
        },
      });
    } catch (error) {
      console.error("Start kiosk device session error:", error);
      res.status(500).json({ success: false, message: "Unable to start kiosk device session" });
    }
  });

  router.get("/kiosk/catalogue", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT p.id,p.name,p.sku,p.barcode,p.description,p.price,p.vat_rate,p.vat_applicable,
                p.age_restricted,p.image_url,p.category_id,p.parent_product_id,p.product_kind,
                p.variant_attributes,p.kiosk_metadata,p.track_stock,p.active,
                c.name AS category_name,
                COALESCE(ps.quantity,p.stock_quantity,0) AS store_stock
           FROM products p
           LEFT JOIN categories c ON c.id=p.category_id
           LEFT JOIN product_store_stock ps
             ON ps.company_id=p.company_id AND ps.store_id=$2 AND ps.product_id=p.id
          WHERE p.company_id=$1
            AND p.active=TRUE
            AND p.sku IS DISTINCT FROM 'MISC'
          ORDER BY COALESCE((p.kiosk_metadata->>'sortOrder')::int,999999),c.display_order,p.name`,
        [req.user.companyId, req.user.storeId]
      );
      res.json({ success: true, data: result.rows.map((row) => ({
        ...row,
        categoryLabel: row.category_name || "Other",
        stock_message: row.track_stock === true
          ? Number(row.store_stock || 0) > 0
            ? `${Number(row.store_stock)} in stock`
            : "Out of stock"
          : "Available",
      })) });
    } catch (error) {
      console.error("Load OneKiosk catalogue error:", error);
      res.status(500).json({ success: false, message: "Unable to load kiosk catalogue" });
    }
  });

  router.get("/kiosk/products/:id/options", authenticate, async (req, res) => {
    try {
      const product = await db(
        `SELECT p.*,c.name AS category_name,
                COALESCE(ps.quantity,p.stock_quantity,0) AS store_stock
           FROM products p
           LEFT JOIN categories c ON c.id=p.category_id
           LEFT JOIN product_store_stock ps
             ON ps.company_id=p.company_id AND ps.store_id=$3 AND ps.product_id=p.id
          WHERE p.id=$1 AND p.company_id=$2 AND p.active=TRUE
          LIMIT 1`,
        [req.params.id, req.user.companyId, req.user.storeId]
      );
      if (!product.rows[0]) return res.status(404).json({ success: false, message: "Product not found" });

      const parentId = product.rows[0].parent_product_id || product.rows[0].id;
      const [variants, modifierRows] = await Promise.all([
        db(
          `SELECT p.id,p.parent_product_id,p.name,p.sku,p.barcode,p.price,p.variant_attributes,
                  p.image_url,p.kiosk_metadata,p.track_stock,
                  COALESCE(ps.quantity,p.stock_quantity,0) AS store_stock
             FROM products p
             LEFT JOIN product_store_stock ps
               ON ps.company_id=p.company_id AND ps.store_id=$3 AND ps.product_id=p.id
            WHERE p.company_id=$2 AND p.active=TRUE AND (p.id=$1 OR p.parent_product_id=$1)
            ORDER BY p.name`,
          [parentId, req.user.companyId, req.user.storeId]
        ),
        db(
          `SELECT g.id AS group_id,g.name AS group_name,g.required,g.max_selections,g.display_order AS group_display_order,
                  o.id AS option_id,o.name AS option_name,o.price,o.track_stock,o.inventory_product_id,o.display_order
             FROM product_modifier_groups g
             LEFT JOIN product_modifier_options o ON o.group_id=g.id AND o.active=TRUE
            WHERE g.company_id=$1 AND g.product_id=$2 AND g.active=TRUE
            ORDER BY g.display_order,o.display_order,o.name`,
          [req.user.companyId, req.params.id]
        ),
      ]);

      const groups = [];
      const byGroup = new Map();
      for (const row of modifierRows.rows) {
        const key = String(row.group_id);
        if (!byGroup.has(key)) {
          const group = {
            id: row.group_id,
            name: row.group_name,
            required: row.required === true,
            maxSelections: Number(row.max_selections || 1),
            options: [],
          };
          byGroup.set(key, group);
          groups.push(group);
        }
        if (row.option_id) {
          byGroup.get(key).options.push({
            id: row.option_id,
            name: row.option_name,
            price: Number(row.price || 0),
            trackStock: row.track_stock === true,
            inventoryProductId: row.inventory_product_id || null,
          });
        }
      }

      res.json({
        success: true,
        data: {
          product: {
            ...product.rows[0],
            categoryLabel: product.rows[0].category_name || "Other",
          },
          variants: variants.rows,
          modifierGroups: groups,
          metadata: product.rows[0].kiosk_metadata || {},
        },
      });
    } catch (error) {
      console.error("Load OneKiosk product options error:", error);
      res.status(500).json({ success: false, message: "Unable to load product options" });
    }
  });

  router.post("/kiosk/quote", authenticate, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ success: true, data: { lines: [], subtotal: 0, total: 0, savings: 0 } });
    try {
      const lines = [];
      let subtotal = 0;
      let total = 0;
      for (const item of items) {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const product = await db(
          `SELECT id,name,price,category_id,vat_rate,vat_applicable
             FROM products WHERE id=$1 AND company_id=$2 AND active=TRUE LIMIT 1`,
          [item.productId, req.user.companyId]
        );
        if (!product.rows[0]) return res.status(400).json({ success: false, message: "A basket product is unavailable" });

        const selectedIds = (Array.isArray(item.modifiers) ? item.modifiers : []).map((m) => m.optionId).filter(Boolean);
        let modifierUnit = 0;
        if (selectedIds.length) {
          const selected = await db(
            `SELECT o.id,o.price
               FROM product_modifier_options o
               JOIN product_modifier_groups g ON g.id=o.group_id
              WHERE o.id=ANY($1::uuid[]) AND g.company_id=$2 AND g.product_id=$3
                AND o.active=TRUE AND g.active=TRUE`,
            [selectedIds, req.user.companyId, item.productId]
          );
          if (selected.rows.length !== new Set(selectedIds.map(String)).size) {
            return res.status(400).json({ success: false, message: "A selected product option is no longer available" });
          }
          modifierUnit = selected.rows.reduce((sum, row) => sum + Number(row.price || 0), 0);
        }

        const pricingRows = await db(
          `SELECT
             COALESCE((SELECT json_agg(spp) FROM scheduled_product_prices spp
               WHERE spp.product_id=$1 AND spp.company_id=$2 AND spp.active=TRUE),'[]') AS scheduled_prices,
             COALESCE((SELECT json_agg(pr) FROM promotions pr
               WHERE pr.company_id=$2 AND pr.active=TRUE AND (pr.product_id=$1 OR pr.category_id=$3)),'[]') AS promotions`,
          [item.productId, req.user.companyId, product.rows[0].category_id]
        );
        const resolved = resolvePrice({
          basePrice: Number(product.rows[0].price || 0) + modifierUnit,
          scheduledPrices: pricingRows.rows[0]?.scheduled_prices || [],
          promotions: pricingRows.rows[0]?.promotions || [],
          quantity,
          at: new Date(),
        });
        const lineSubtotal = (Number(product.rows[0].price || 0) + modifierUnit) * quantity;
        subtotal += lineSubtotal;
        total += resolved.total;
        lines.push({
          productId: item.productId,
          name: product.rows[0].name,
          quantity,
          unitPrice: resolved.unitPrice,
          lineTotal: resolved.total,
          originalLineTotal: lineSubtotal,
          savings: Math.max(0, lineSubtotal - resolved.total),
          promotionId: resolved.promotionId,
          quantityOfferId: resolved.quantityOfferId,
        });
      }
      res.json({
        success: true,
        data: {
          lines,
          subtotal: Math.round(subtotal * 100) / 100,
          total: Math.round(total * 100) / 100,
          savings: Math.round(Math.max(0, subtotal - total) * 100) / 100,
        },
      });
    } catch (error) {
      console.error("Quote OneKiosk basket error:", error);
      res.status(500).json({ success: false, message: error.message || "Unable to price basket" });
    }
  });

  router.get("/kiosk/flows", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT id,name,trigger_key,conditions,action,active,lifecycle_status,version,
                managed,user_modified,source_package_version,updated_at
           FROM platform_rules
          WHERE company_id=$1
            AND action->>'scope'='one_kiosk'
            AND action->>'flowType'='KIOSK_EXPERIENCE'
            AND active=TRUE
            AND lifecycle_status='ACTIVE'
          ORDER BY
            CASE WHEN action->>'defaultForNewDevices'='true' THEN 0 ELSE 1 END,
            name`,
        [req.user.companyId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load OneKiosk flows error:", error);
      res.status(500).json({ success: false, message: "Unable to load OneKiosk flows" });
    }
  });

  router.get("/kiosk/runtime", authenticate, async (req, res) => {
    const deviceKey = String(req.query?.deviceKey || "").trim();
    if (!deviceKey) return res.status(400).json({ success: false, message: "Kiosk device key is required" });
    if (req.user?.mode === "kiosk" && String(req.user.kioskDeviceKey || "") !== deviceKey) {
      return res.status(403).json({ success: false, message: "This kiosk session belongs to another device" });
    }
    try {
      const deviceResult = await db(
        `SELECT kd.id,kd.device_key,kd.name,kd.workflow_id,kd.payment_connector_id,
                pc.name AS payment_connector_name,pc.connector_package_key,
                pc.enabled AS payment_connector_enabled,pc.connection_status AS payment_connector_status,
                pc.last_error AS payment_connector_error,pc.last_connected_at AS payment_connector_last_connected_at,
                pc.till_id AS payment_connector_till_id,
                pr.id AS flow_id,pr.name AS flow_name,pr.version AS flow_version,
                pr.action AS flow_action,pr.lifecycle_status AS flow_status
           FROM kiosk_devices kd
           LEFT JOIN integration_connections pc
             ON pc.id=kd.payment_connector_id
            AND pc.company_id=kd.company_id
           LEFT JOIN platform_rules pr
             ON pr.id=kd.workflow_id
            AND pr.company_id=kd.company_id
            AND pr.action->>'scope'='one_kiosk'
            AND pr.action->>'flowType'='KIOSK_EXPERIENCE'
            AND pr.active=TRUE
            AND pr.lifecycle_status='ACTIVE'
          WHERE kd.company_id=$1 AND kd.store_id=$2 AND kd.device_key=$3
          LIMIT 1`,
        [req.user.companyId, req.user.storeId, deviceKey]
      );
      const device = deviceResult.rows[0];
      if (!device) return res.status(404).json({ success: false, message: "Kiosk device is not registered" });

      let flow = device.flow_id ? device : null;
      if (!flow) {
        const fallback = await db(
          `SELECT id AS flow_id,name AS flow_name,version AS flow_version,
                  action AS flow_action,lifecycle_status AS flow_status
             FROM platform_rules
            WHERE company_id=$1
              AND action->>'scope'='one_kiosk'
              AND action->>'flowType'='KIOSK_EXPERIENCE'
              AND active=TRUE
              AND lifecycle_status='ACTIVE'
            ORDER BY CASE WHEN action->>'defaultForNewDevices'='true' THEN 0 ELSE 1 END,name
            LIMIT 1`,
          [req.user.companyId]
        );
        flow = fallback.rows[0] || null;
      }
      if (!flow?.flow_action?.ui) {
        return res.status(409).json({ success: false, message: "No OneKiosk experience flow is available for this device" });
      }
      res.json({
        success: true,
        data: {
          device: { id: device.id, deviceKey: device.device_key, name: device.name },
          payment: {
            connectorInstanceId: device.payment_connector_id || null,
            name: device.payment_connector_name || null,
            packageKey: device.connector_package_key || null,
            status: device.payment_connector_enabled !== true
              ? "NOT_CONFIGURED"
              : device.payment_connector_status === "CONNECTED"
                ? "READY"
                : device.payment_connector_status || "UNKNOWN",
            error: device.payment_connector_error || null,
            lastConnectedAt: device.payment_connector_last_connected_at || null,
            tillId: device.payment_connector_till_id || null,
          },
          flow: {
            id: flow.flow_id,
            name: flow.flow_name,
            version: flow.flow_version,
            lifecycleStatus: flow.flow_status,
            templateKey: flow.flow_action?.templateKey || null,
          },
          ui: flow.flow_action.ui,
        },
      });
    } catch (error) {
      console.error("Load OneKiosk runtime error:", error);
      res.status(500).json({ success: false, message: "Unable to load OneKiosk runtime" });
    }
  });

  router.get("/kiosk/payment-connectors", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT c.id,c.name,c.connector_package_key,c.till_id,c.store_id,c.enabled,
                c.connection_status,c.last_error,c.last_connected_at,c.last_test_at,
                t.name AS till_name,t.terminal_number
           FROM integration_connections c
           JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
           LEFT JOIN terminals t ON t.id=c.till_id
          WHERE c.company_id=$1
            AND c.enabled=TRUE
            AND (c.store_id IS NULL OR c.store_id=$2)
            AND c.till_id IS NOT NULL
            AND (
              c.connector_capabilities ? 'payment.sale'
              OR EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(COALESCE(p.manifest->'connectorApp'->'capabilities','[]'::jsonb)) cap
                 WHERE CASE
                   WHEN jsonb_typeof(cap)='string' THEN trim(both '"' from cap::text)
                   ELSE cap->>'key'
                 END = 'payment.sale'
              )
            )
          ORDER BY c.name`,
        [req.user.companyId, req.user.storeId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load OneKiosk payment connectors error:", error);
      res.status(500).json({ success: false, message: "Unable to load kiosk payment connectors" });
    }
  });

  router.get("/kiosk/devices", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT kd.*,
                pc.name AS payment_connector_name,
                pc.connector_package_key AS payment_connector_package_key,
                pc.connection_status AS payment_connector_status,
                pc.last_error AS payment_connector_error,
                pc.last_connected_at AS payment_connector_last_connected_at,
                pc.till_id AS payment_connector_till_id,
                pt.name AS payment_terminal_name,
                pt.provider AS payment_provider,
                pt.active AS payment_terminal_active,
                pt.last_test_result AS payment_terminal_last_test,
                pt.last_tested_at AS payment_terminal_last_tested_at,
                hc.device_name AS printer_name,
                hc.active AS printer_active,
                hc.connection_type AS printer_connection_type,
                hc.last_test_result AS printer_last_test,
                hc.last_tested_at AS printer_last_tested_at,
                CASE
                  WHEN kd.payment_connector_id IS NULL THEN 'NOT_CONFIGURED'
                  WHEN pc.enabled IS FALSE THEN 'OFFLINE'
                  WHEN pc.connection_status='CONNECTED' THEN 'READY'
                  WHEN pc.connection_status IN ('ERROR','DISCONNECTED','DISABLED') THEN 'OFFLINE'
                  ELSE kd.payment_status
                END AS effective_payment_status,
                CASE
                  WHEN NULLIF(kd.printer_name,'') IS NULL AND kd.printer_hardware_id IS NULL THEN 'NOT_CONFIGURED'
                  WHEN hc.id IS NOT NULL AND hc.active IS FALSE THEN 'OFFLINE'
                  ELSE kd.printer_status
                END AS effective_printer_status,
                CASE
                  WHEN kd.active IS FALSE THEN 'OFFLINE'
                  WHEN kd.last_heartbeat_at IS NULL THEN 'OFFLINE'
                  WHEN kd.last_heartbeat_at < NOW() - INTERVAL '60 seconds' THEN 'OFFLINE'
                  WHEN kd.internet_status = 'OFFLINE' OR kd.server_status = 'OFFLINE' THEN 'OFFLINE'
                  WHEN kd.payment_required AND (kd.payment_connector_id IS NULL OR pc.enabled IS FALSE OR COALESCE(pc.connection_status,'') <> 'CONNECTED') THEN 'DEGRADED'
                  WHEN kd.printer_required AND ((NULLIF(kd.printer_name,'') IS NULL AND kd.printer_hardware_id IS NULL) OR (hc.id IS NOT NULL AND hc.active IS FALSE) OR kd.printer_status NOT IN ('READY','ONLINE')) THEN 'DEGRADED'
                  ELSE 'ONLINE'
                END AS overall_status
           FROM kiosk_devices kd
           LEFT JOIN integration_connections pc ON pc.id=kd.payment_connector_id AND pc.company_id=kd.company_id
           LEFT JOIN payment_terminals pt ON pt.id=kd.payment_terminal_id AND pt.company_id=kd.company_id
           LEFT JOIN hardware_configurations hc ON hc.id=kd.printer_hardware_id AND hc.company_id=kd.company_id
          WHERE kd.company_id=$1
            AND ($2::uuid IS NULL OR kd.store_id=$2)
          ORDER BY kd.name, kd.created_at`,
        [req.user.companyId, req.user.storeId || null]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load kiosk devices error:", error);
      res.status(500).json({ success: false, message: "Unable to load kiosk devices" });
    }
  });

  router.post("/kiosk/devices/register", authenticate, async (req, res) => {
    const deviceKey = String(req.body?.deviceKey || "").trim();
    const name = String(req.body?.name || "OneKiosk").trim().slice(0, 150);
    if (!deviceKey) return res.status(400).json({ success: false, message: "Kiosk device key is required" });
    try {
      const defaultFlow = await db(
        `SELECT id
           FROM platform_rules
          WHERE company_id=$1
            AND action->>'scope'='one_kiosk'
            AND action->>'flowType'='KIOSK_EXPERIENCE'
            AND active=TRUE
            AND lifecycle_status='ACTIVE'
          ORDER BY CASE WHEN action->>'defaultForNewDevices'='true' THEN 0 ELSE 1 END,name
          LIMIT 1`,
        [req.user.companyId]
      );
      const result = await db(
        `INSERT INTO kiosk_devices (company_id,store_id,device_key,name,workflow_id,last_heartbeat_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         ON CONFLICT (company_id,device_key)
         DO UPDATE SET store_id=EXCLUDED.store_id,
                       name=COALESCE(NULLIF(kiosk_devices.name,''),EXCLUDED.name),
                       workflow_id=COALESCE(kiosk_devices.workflow_id,EXCLUDED.workflow_id),
                       last_heartbeat_at=NOW(),updated_at=NOW()
         RETURNING *`,
        [req.user.companyId, req.user.storeId, deviceKey, name, defaultFlow.rows[0]?.id || null]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Register kiosk device error:", error);
      res.status(500).json({ success: false, message: "Unable to register kiosk device" });
    }
  });

  router.put("/kiosk/devices/:id/settings", authenticate, async (req, res) => {
    let workflowId = req.body?.workflowId || null;
    const paymentConnectorId = req.body?.paymentConnectorId || null;
    const paymentTerminalId = req.body?.paymentTerminalId || null;
    const printerHardwareId = req.body?.printerHardwareId || null;
    const printerName = req.body?.printerName == null ? null : String(req.body.printerName).trim().slice(0, 150);
    const printerConnectionType = req.body?.printerConnectionType == null ? null : String(req.body.printerConnectionType).trim().slice(0, 50);
    const printerConnectionAddress = req.body?.printerConnectionAddress == null ? null : String(req.body.printerConnectionAddress).trim().slice(0, 500);
    const printerPaperWidth = ["58mm","80mm"].includes(String(req.body?.printerPaperWidth || "")) ? String(req.body.printerPaperWidth) : "80mm";
    const name = String(req.body?.name || "OneKiosk").trim().slice(0, 150);
    const active = req.body?.active !== false;
    const paymentRequired = req.body?.paymentRequired !== false;
    const printerRequired = req.body?.printerRequired === true;
    try {
      if (!workflowId) {
        const defaultFlow = await db(
          `SELECT id FROM platform_rules
            WHERE company_id=$1
              AND action->>'scope'='one_kiosk'
              AND action->>'flowType'='KIOSK_EXPERIENCE'
            ORDER BY CASE WHEN action->>'defaultForNewDevices'='true' THEN 0 ELSE 1 END,name
            LIMIT 1`,
          [req.user.companyId]
        );
        workflowId = defaultFlow.rows[0]?.id || null;
      }
      if (workflowId) {
        const flow = await db(
          `SELECT id FROM platform_rules
            WHERE id=$1 AND company_id=$2
              AND action->>'scope'='one_kiosk'
              AND action->>'flowType'='KIOSK_EXPERIENCE'
              AND active=TRUE
              AND lifecycle_status='ACTIVE'`,
          [workflowId, req.user.companyId]
        );
        if (!flow.rows.length) return res.status(400).json({ success: false, message: "Workflow is not a OneKiosk experience flow" });
      }
      if (paymentConnectorId) {
        const connector = await db(
          `SELECT c.id,c.till_id
             FROM integration_connections c
             JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
            WHERE c.id=$1 AND c.company_id=$2 AND c.enabled=TRUE
              AND (c.store_id IS NULL OR c.store_id=$3)
              AND c.till_id IS NOT NULL
              AND (
                c.connector_capabilities ? 'payment.sale'
                OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(COALESCE(p.manifest->'connectorApp'->'capabilities','[]'::jsonb)) cap
                   WHERE CASE WHEN jsonb_typeof(cap)='string' THEN trim(both '"' from cap::text) ELSE cap->>'key' END='payment.sale'
                )
              )`,
          [paymentConnectorId, req.user.companyId, req.user.storeId]
        );
        if (!connector.rows.length) return res.status(400).json({ success: false, message: "Payment connector is not available for this store" });
      }
      if (paymentTerminalId) {
        const payment = await db(
          "SELECT id FROM payment_terminals WHERE id=$1 AND company_id=$2 AND store_id=$3",
          [paymentTerminalId, req.user.companyId, req.user.storeId]
        );
        if (!payment.rows.length) return res.status(400).json({ success: false, message: "Payment terminal is not available for this store" });
      }
      if (printerHardwareId) {
        const printer = await db(
          "SELECT id FROM hardware_configurations WHERE id=$1 AND company_id=$2 AND store_id=$3 AND device_type='RECEIPT_PRINTER'",
          [printerHardwareId, req.user.companyId, req.user.storeId]
        );
        if (!printer.rows.length) return res.status(400).json({ success: false, message: "Receipt printer is not available for this store" });
      }
      const result = await db(
        `UPDATE kiosk_devices
            SET name=$1,workflow_id=$2,payment_connector_id=$3,payment_terminal_id=$4,printer_hardware_id=$5,
                printer_name=$6,printer_connection_type=$7,printer_connection_address=$8,printer_paper_width=$9,
                payment_required=$10,printer_required=$11,active=$12,updated_at=NOW()
          WHERE id=$13 AND company_id=$14 AND store_id=$15
          RETURNING *`,
        [name, workflowId, paymentConnectorId, paymentTerminalId, printerHardwareId, printerName, printerConnectionType, printerConnectionAddress, printerPaperWidth, paymentRequired, printerRequired, active, req.params.id, req.user.companyId, req.user.storeId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device not found" });
      await writeAudit?.(req.user.companyId, req.user.id, "kiosk.device.settings", "kiosk_device", req.params.id, {
        workflowId, paymentConnectorId, paymentTerminalId, printerHardwareId, printerName, printerConnectionType, printerConnectionAddress, printerPaperWidth, paymentRequired, printerRequired, active,
      });
      res.json({ success: true, message: "Kiosk device settings saved", data: result.rows[0] });
    } catch (error) {
      console.error("Save kiosk device settings error:", error);
      res.status(500).json({ success: false, message: "Unable to save kiosk device settings" });
    }
  });

  router.post("/kiosk/devices/:id/heartbeat", authenticate, async (req, res) => {
    if (req.user?.mode === "kiosk" && String(req.user.kioskDeviceId || "") !== String(req.params.id)) {
      return res.status(403).json({ success: false, message: "This kiosk session belongs to another device" });
    }
    const internetStatus = normaliseHealth(req.body?.internetStatus);
    const serverStatus = normaliseHealth(req.body?.serverStatus);
    const paymentStatus = normaliseHealth(req.body?.paymentStatus);
    const printerStatus = normaliseHealth(req.body?.printerStatus);
    try {
      const result = await db(
        `UPDATE kiosk_devices
            SET internet_status=$1,server_status=$2,payment_status=$3,printer_status=$4,
                last_heartbeat_at=NOW(),last_health_payload=$5::jsonb,updated_at=NOW()
          WHERE id=$6 AND company_id=$7 AND store_id=$8
          RETURNING *`,
        [
          internetStatus, serverStatus, paymentStatus, printerStatus,
          JSON.stringify(req.body?.details && typeof req.body.details === "object" ? req.body.details : {}),
          req.params.id, req.user.companyId, req.user.storeId,
        ]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device not found" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Kiosk heartbeat error:", error);
      res.status(500).json({ success: false, message: "Unable to update kiosk health" });
    }
  });

  router.post("/kiosk/orders/from-sale", authenticate, authorize("sale.create"), async (req, res) => {
    if (!pool) {
      return res.status(500).json({ success: false, message: "DATABASE_URL is not configured" });
    }

    const saleId = String(req.body?.saleId || "").trim();
    const deviceKey = String(req.body?.deviceKey || "").trim();
    const fulfilmentType = String(req.body?.fulfilmentType || "").trim().toUpperCase();

    if (!saleId) {
      return res.status(400).json({ success: false, message: "A completed sale is required" });
    }
    if (!deviceKey) {
      return res.status(400).json({ success: false, message: "Kiosk device identity is required" });
    }

    const runtime = await db(
      `SELECT kd.id AS device_id,kd.workflow_id,pr.action
         FROM kiosk_devices kd
         LEFT JOIN platform_rules pr
           ON pr.id=kd.workflow_id
          AND pr.company_id=kd.company_id
          AND pr.action->>'scope'='one_kiosk'
          AND pr.action->>'flowType'='KIOSK_EXPERIENCE'
        WHERE kd.company_id=$1 AND kd.store_id=$2 AND kd.device_key=$3 AND kd.active=TRUE
        LIMIT 1`,
      [req.user.companyId, req.user.storeId, deviceKey]
    );
    const runtimeRow = runtime.rows[0];
    if (!runtimeRow?.action?.ui) {
      return res.status(409).json({ success: false, message: "No active OneKiosk experience flow is assigned to this device" });
    }
    const fulfilmentScreen = (runtimeRow.action.ui.screens || []).find((screen) => screen?.type === "FULFILMENT");
    const configuredOption = (fulfilmentScreen?.options || []).find(
      (option) => String(option?.key || "").toUpperCase() === fulfilmentType
    );
    if (!configuredOption) {
      return res.status(400).json({ success: false, message: "This fulfilment option is not allowed by the assigned OneKiosk flow" });
    }
    const canonicalFulfilmentType = String(configuredOption.canonicalType || "SELF_PICKUP").toUpperCase();

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const saleResult = await client.query(
        `SELECT s.id,s.company_id,s.store_id,s.user_id,s.customer_id,s.receipt_number,
                s.subtotal,s.tax,s.total,s.status,s.created_at
           FROM sales s
          WHERE s.id=$1
            AND s.company_id=$2
            AND s.store_id=$3
            AND s.user_id=$4
          FOR UPDATE`,
        [saleId, req.user.companyId, req.user.storeId, req.user.id]
      );
      const sale = saleResult.rows[0];
      if (!sale) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(404).json({ success: false, message: "Completed kiosk sale was not found" });
      }

      if (!["completed", "paid", "partially_paid"].includes(String(sale.status || "").toLowerCase())) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "The sale has not completed payment" });
      }

      const existing = await client.query(
        `SELECT * FROM online_orders
          WHERE company_id=$1
            AND platform='one_kiosk'
            AND platform_data->>'saleId'=$2
          LIMIT 1`,
        [req.user.companyId, saleId]
      );
      if (existing.rows[0]) {
        await client.query("COMMIT");
        transactionStarted = false;
        return res.json({
          success: true,
          message: "Kiosk order already created",
          data: {
            order: existing.rows[0],
            collectionNumber: existing.rows[0].external_reference,
          },
        });
      }

      const payment = await client.query(
        `SELECT payment_method,status,provider,provider_transaction_id
           FROM payments
          WHERE sale_id=$1
          ORDER BY created_at DESC
          LIMIT 1`,
        [saleId]
      );
      const paymentRow = payment.rows[0];
      if (!paymentRow || String(paymentRow.status || "").toLowerCase() !== "completed") {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "Payment is not confirmed for this sale" });
      }

      const itemsResult = await client.query(
        `SELECT si.product_id,si.product_name,si.quantity,si.unit_price,si.tax,si.total,
                si.modifier_data,si.bundle_components
           FROM sale_items si
          WHERE si.sale_id=$1
          ORDER BY si.id`,
        [saleId]
      );
      if (!itemsResult.rows.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "The completed sale has no order items" });
      }

      const compactId = String(sale.id).replace(/-/g, "").slice(-6).toUpperCase();
      const collectionNumber = `K${compactId}`;
      const externalOrderId = `KIOSK-${sale.id}`;

      const orderResult = await client.query(
        `INSERT INTO online_orders (
           company_id,store_id,customer_id,platform,external_order_id,external_reference,
           status,fulfilment_type,currency,subtotal,tax,delivery_fee,total,notes,
           payment_method,payment_status,platform_data,inventory_reserved,
           accepted_at,preparing_at
         )
         VALUES (
           $1,$2,$3,'one_kiosk',$4,$5,
           'PREPARING',$6,'GBP',$7,$8,0,$9,$10,
           $11,'paid',$12::jsonb,FALSE,
           NOW(),NOW()
         )
         RETURNING *`,
        [
          req.user.companyId,
          req.user.storeId,
          sale.customer_id || null,
          externalOrderId,
          collectionNumber,
          canonicalFulfilmentType,
          Number(sale.subtotal) || 0,
          Number(sale.tax) || 0,
          Number(sale.total) || 0,
          `Paid at OneKiosk. Sale ${sale.receipt_number}.`,
          paymentRow.payment_method || "card",
          JSON.stringify({
            source: "ONE_KIOSK",
            requestedFulfilmentType: fulfilmentType,
            workflowId: runtimeRow.workflow_id || null,
            kioskDeviceId: runtimeRow.device_id || null,
            saleId: sale.id,
            receiptNumber: sale.receipt_number,
            paymentProvider: paymentRow.provider || null,
            paymentTransactionId: paymentRow.provider_transaction_id || null,
            inventoryHandledBySale: true,
          }),
        ]
      );
      const order = orderResult.rows[0];

      for (const item of itemsResult.rows) {
        await client.query(
          `INSERT INTO online_order_items (
             order_id,product_id,product_name,quantity,unit_price,tax,total,mapping_status,platform_data
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,'MAPPED',$8::jsonb)`,
          [
            order.id,
            item.product_id,
            item.product_name,
            item.quantity,
            item.unit_price,
            item.tax,
            item.total,
            JSON.stringify({
              source: "SALE_ITEM",
              modifierData: item.modifier_data || null,
              bundleComponents: item.bundle_components || null,
            }),
          ]
        );
      }

      await client.query(
        `INSERT INTO online_order_events (
           order_id,event_type,from_status,to_status,message,platform_response,actor_user_id
         )
         VALUES
           ($1,'KIOSK_PAYMENT_CONFIRMED',NULL,'PREPARING',$2,$3::jsonb,$4),
           ($1,'ORDER_PREPARING',NULL,'PREPARING',$5,$3::jsonb,$4)`,
        [
          order.id,
          `Payment confirmed; collection number ${collectionNumber} issued`,
          JSON.stringify({ source: "ONE_KIOSK", saleId: sale.id }),
          req.user.id,
          "Paid kiosk order sent to fulfilment",
        ]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      if (typeof writeAudit === "function") {
        Promise.resolve(
          writeAudit(req.user.companyId, req.user.id, "KIOSK_ORDER_CREATED", "online_order", order.id, {
            saleId: sale.id,
            collectionNumber,
            fulfilmentType,
            storeId: req.user.storeId,
          })
        ).catch(() => {});
      }

      return res.status(201).json({
        success: true,
        message: "Payment complete — order sent for collection",
        data: {
          order,
          collectionNumber,
          receiptNumber: sale.receipt_number,
          fulfilmentType,
        },
      });
    } catch (error) {
      if (transactionStarted) {
        try { await client.query("ROLLBACK"); } catch {}
      }
      console.error("Create kiosk fulfilment order error:", error);
      return res.status(500).json({ success: false, message: error.message || "Unable to create kiosk collection order" });
    } finally {
      client.release();
    }
  });

  return router;
}


export function createKioskModeGate() {
  return function kioskModeGate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) return next();

    let payload;
    try {
      payload = jwt.decode(header.substring(7));
    } catch {
      return next();
    }
    if (payload?.mode !== "kiosk") return next();

    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const method = String(req.method || "GET").toUpperCase();

    const allowed =
      (method === "GET" && path === "/api/health") ||
      (method === "GET" && path === "/api/settings") ||
      (method === "GET" && path === "/api/kiosk/runtime") ||
      (method === "GET" && path === "/api/kiosk/catalogue") ||
      (method === "GET" && /^\/api\/kiosk\/products\/[^/]+\/options$/.test(path)) ||
      (method === "POST" && path === "/api/kiosk/quote") ||
      (method === "POST" && path === "/api/kiosk/orders/from-sale") ||
      (method === "POST" && /^\/api\/kiosk\/devices\/[^/]+\/heartbeat$/.test(path)) ||
      (method === "POST" && path === "/api/sales") ||
      (["POST","DELETE"].includes(method) && /^\/api\/sales\/[^/]+\/receipt-qr$/.test(path));

    if (allowed) return next();
    return res.status(403).json({
      success: false,
      message: "Not available in OneKiosk customer mode",
    });
  };
}
