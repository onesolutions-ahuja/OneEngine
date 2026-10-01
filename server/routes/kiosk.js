import express from "express";
import jwt from "jsonwebtoken";
import { resolvePrice } from "../services/pricingEngine.js";
import { executeConnectorWorkflowAction } from "../services/platformWorkflow.js";
import { resendInvoiceByChannel } from "../services/invoiceDelivery.js";

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
  connectorDrivers = null,
  jwtSecret = process.env.JWT_SECRET,
  modeTtl = KIOSK_MODE_TTL,
}) {
  const router = express.Router();

  const normaliseHealth = (value) => {
    const key = String(value || "UNKNOWN").trim().toUpperCase();
    return ["ONLINE","OFFLINE","DEGRADED","READY","ERROR","NOT_CONFIGURED","UNKNOWN"].includes(key) ? key : "UNKNOWN";
  };

  router.post("/kiosk/display-session", authenticate, authorize("online_orders.view"), async (req, res) => {
    const flowId = req.body?.flowId ? String(req.body.flowId) : null;
    try {
      let selectedFlowId = flowId;
      if (selectedFlowId) {
        const flow = await db(
          `SELECT id FROM platform_rules
            WHERE id=$1 AND company_id=$2
              AND action->>'scope'='one_kiosk'
              AND action->>'flowType'='KIOSK_EXPERIENCE'
              AND active=TRUE AND lifecycle_status='ACTIVE'
            LIMIT 1`,
          [selectedFlowId, req.user.companyId]
        );
        if (!flow.rows.length) return res.status(400).json({ success: false, message: "Selected OneKiosk display flow is unavailable" });
      } else {
        const flow = await db(
          `SELECT id FROM platform_rules
            WHERE company_id=$1
              AND action->>'scope'='one_kiosk'
              AND action->>'flowType'='KIOSK_EXPERIENCE'
              AND active=TRUE AND lifecycle_status='ACTIVE'
            ORDER BY CASE WHEN action->>'defaultForNewDevices'='true' THEN 0 ELSE 1 END,name
            LIMIT 1`,
          [req.user.companyId]
        );
        selectedFlowId = flow.rows[0]?.id || null;
      }
      const modeToken = jwt.sign(
        {
          id: req.user.id,
          companyId: req.user.companyId,
          storeId: req.user.storeId,
          roleId: req.user.roleId,
          username: req.user.username,
          mode: "kiosk_display",
          kioskDisplayFlowId: selectedFlowId,
        },
        jwtSecret,
        { expiresIn: modeTtl }
      );
      await writeAudit?.(req.user.companyId, req.user.id, "KIOSK_DISPLAY_SESSION_STARTED", "platform_rule", selectedFlowId, {
        storeId: req.user.storeId,
      });
      res.status(201).json({ success: true, data: { modeToken, flowId: selectedFlowId, mode: "kiosk_display" } });
    } catch (error) {
      console.error("Start kiosk display session error:", error);
      res.status(500).json({ success: false, message: "Unable to start kiosk display session" });
    }
  });

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
                COALESCE(ps.quantity,p.stock_quantity,0) AS store_stock,
                COALESCE((SELECT json_agg(spp) FROM scheduled_product_prices spp
                  WHERE spp.product_id=p.id AND spp.company_id=p.company_id AND spp.active=TRUE),'[]') AS scheduled_prices,
                COALESCE((SELECT json_agg(pr) FROM promotions pr
                  WHERE pr.company_id=p.company_id AND pr.active=TRUE
                    AND (pr.product_id=p.id OR pr.category_id=p.category_id)),'[]') AS promotions
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
      res.json({ success: true, data: result.rows.map((row) => {
        const resolved = resolvePrice({
          basePrice: Number(row.price || 0),
          scheduledPrices: row.scheduled_prices || [],
          promotions: row.promotions || [],
          quantity: 1,
          at: new Date(),
        });
        const basePrice = Number(row.price || 0);
        return {
          ...row,
          categoryLabel: row.category_name || "Other",
          base_price: basePrice,
          display_price: resolved.unitPrice,
          display_savings: Math.max(0, Math.round((basePrice - resolved.unitPrice) * 100) / 100),
          promotion_id: resolved.promotionId || null,
          stock_message: row.track_stock === true
            ? Number(row.store_stock || 0) > 0
              ? `${Number(row.store_stock)} in stock`
              : "Out of stock"
            : "Available",
        };
      }) });
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
      const [variants, modifierRows, bundleRows] = await Promise.all([
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
        db(
          `SELECT bc.component_product_id AS id,p.name,p.image_url,bc.quantity
             FROM product_bundle_components bc
             JOIN products p ON p.id=bc.component_product_id AND p.company_id=$2 AND p.active=TRUE
            WHERE bc.bundle_product_id=$1
            ORDER BY p.name`,
          [req.params.id, req.user.companyId]
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
          bundleComponents: bundleRows.rows.map((row) => ({
            id: row.id,
            name: row.name,
            imageUrl: row.image_url || null,
            quantity: Number(row.quantity || 1),
          })),
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

  router.post("/kiosk/availability", authenticate, async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.json({ success: true, data: [] });
    const productIds = [...new Set(items.map((item) => String(item.productId || "")).filter(Boolean))];
    if (!productIds.length) return res.json({ success: true, data: [] });
    try {
      const stores = await db(
        `SELECT s.id,s.name,s.code,
                COALESCE(jsonb_object_agg(p.id::text,COALESCE(ps.quantity,0)) FILTER (WHERE p.id IS NOT NULL),'{}'::jsonb) AS stock
           FROM stores s
           CROSS JOIN products p
           LEFT JOIN product_store_stock ps
             ON ps.company_id=s.company_id AND ps.store_id=s.id AND ps.product_id=p.id
          WHERE s.company_id=$1 AND s.active=TRUE AND p.company_id=$1 AND p.id=ANY($2::uuid[])
          GROUP BY s.id,s.name,s.code
          ORDER BY s.name`,
        [req.user.companyId, productIds]
      );
      const requested = new Map(items.map((item) => [String(item.productId), Math.max(1, Number(item.quantity) || 1)]));
      const data = stores.rows.map((store) => {
        const stock = store.stock || {};
        const shortages = [...requested.entries()]
          .filter(([productId, qty]) => Number(stock[productId] || 0) < qty)
          .map(([productId, qty]) => ({ productId, requested: qty, available: Number(stock[productId] || 0) }));
        return {
          id: store.id,
          name: store.name,
          code: store.code,
          canFulfil: shortages.length === 0,
          shortages,
          stock,
          current: String(store.id) === String(req.user.storeId),
        };
      });
      res.json({ success: true, data });
    } catch (error) {
      console.error("Load OneKiosk store availability error:", error);
      res.status(500).json({ success: false, message: "Unable to check collection availability" });
    }
  });

  router.post("/kiosk/age-approval/request", authenticate, async (req, res) => {
    const deviceKey = String(req.body?.deviceKey || req.user?.kioskDeviceKey || "").trim();
    if (!deviceKey) return res.status(400).json({ success: false, message: "Kiosk device key is required" });
    if (req.user?.mode === "kiosk" && String(req.user.kioskDeviceKey || "") !== deviceKey) {
      return res.status(403).json({ success: false, message: "This kiosk session belongs to another device" });
    }
    try {
      const result = await db(
        `UPDATE kiosk_devices
            SET age_approval_requested_at=NOW(),age_approved_until=NULL,age_approved_by=NULL,updated_at=NOW()
          WHERE company_id=$1 AND store_id=$2 AND device_key=$3 AND active=TRUE
          RETURNING id,name,age_approval_requested_at`,
        [req.user.companyId, req.user.storeId, deviceKey]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device is unavailable" });
      await writeAudit?.(req.user.companyId, req.user.id || null, "KIOSK_AGE_APPROVAL_REQUESTED", "kiosk_device", result.rows[0].id, {});
      res.json({ success: true, message: "Staff approval requested", data: result.rows[0] });
    } catch (error) {
      console.error("OneKiosk age approval request error:", error);
      res.status(500).json({ success: false, message: "Unable to request age approval" });
    }
  });

  router.post("/kiosk/devices/:id/age-approve", authenticate, authorize("sale.create"), async (req, res) => {
    if (req.user?.mode === "kiosk") return res.status(403).json({ success: false, message: "Staff access required" });
    try {
      const minutes = Math.min(15, Math.max(2, Number(req.body?.minutes) || 5));
      const result = await db(
        `UPDATE kiosk_devices
            SET age_approved_until=NOW()+($1::text||' minutes')::interval,
                age_approved_by=$2,age_approval_requested_at=NULL,updated_at=NOW()
          WHERE id=$3 AND company_id=$4 AND store_id=$5 AND active=TRUE
          RETURNING id,name,age_approved_until`,
        [minutes, req.user.id, req.params.id, req.user.companyId, req.user.storeId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device not found" });
      await writeAudit?.(req.user.companyId, req.user.id, "KIOSK_AGE_APPROVED", "kiosk_device", req.params.id, { minutes });
      res.json({ success: true, message: "Age check approved", data: result.rows[0] });
    } catch (error) {
      console.error("Approve OneKiosk age check error:", error);
      res.status(500).json({ success: false, message: "Unable to approve age check" });
    }
  });

  router.post("/kiosk/assistance", authenticate, async (req, res) => {
    const deviceKey = String(req.body?.deviceKey || req.user?.kioskDeviceKey || "").trim();
    const note = String(req.body?.note || "Customer requested assistance").trim().slice(0, 300);
    if (!deviceKey) return res.status(400).json({ success: false, message: "Kiosk device key is required" });
    if (req.user?.mode === "kiosk" && String(req.user.kioskDeviceKey || "") !== deviceKey) {
      return res.status(403).json({ success: false, message: "This kiosk session belongs to another device" });
    }
    try {
      const result = await db(
        `UPDATE kiosk_devices
            SET assistance_requested_at=NOW(),assistance_note=$1,updated_at=NOW()
          WHERE company_id=$2 AND store_id=$3 AND device_key=$4 AND active=TRUE
          RETURNING id,name,assistance_requested_at,assistance_note`,
        [note, req.user.companyId, req.user.storeId, deviceKey]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device is unavailable" });
      await writeAudit?.(req.user.companyId, req.user.id || null, "KIOSK_ASSISTANCE_REQUESTED", "kiosk_device", result.rows[0].id, { note });
      res.json({ success: true, message: "A member of staff has been notified", data: result.rows[0] });
    } catch (error) {
      console.error("OneKiosk assistance request error:", error);
      res.status(500).json({ success: false, message: "Unable to request assistance" });
    }
  });

  router.post("/kiosk/devices/:id/assistance-clear", authenticate, async (req, res) => {
    if (req.user?.mode === "kiosk") return res.status(403).json({ success: false, message: "Staff access required" });
    try {
      const result = await db(
        `UPDATE kiosk_devices SET assistance_requested_at=NULL,assistance_note=NULL,updated_at=NOW()
          WHERE id=$1 AND company_id=$2 AND store_id=$3 RETURNING id`,
        [req.params.id, req.user.companyId, req.user.storeId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device not found" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to clear assistance request" });
    }
  });

  router.post("/kiosk/customer-lookup", authenticate, async (req, res) => {
    const query = String(req.body?.query || "").trim().slice(0, 255);
    if (!query) return res.status(400).json({ success: false, message: "Enter a phone number or email" });
    try {
      const digits = query.replace(/[^0-9]/g, "");
      const result = await db(
        `SELECT c.id,c.name,c.email,c.phone,
                COALESCE(lb.balance,0) AS loyalty_balance,
                COALESCE(cs.loyalty_enabled,FALSE) AS loyalty_enabled,
                cs.loyalty_redeem_value_per_point,
                cs.loyalty_min_points_redeem
           FROM customers c
           LEFT JOIN customer_loyalty_balances lb
             ON lb.company_id=c.company_id AND lb.customer_id=c.id
           LEFT JOIN company_settings cs
             ON cs.company_id=c.company_id
          WHERE c.company_id=$1 AND c.active=TRUE
            AND (
              LOWER(COALESCE(c.email,''))=LOWER($2)
              OR c.phone=$2
              OR ($3<>'' AND REGEXP_REPLACE(COALESCE(c.phone,''),'[^0-9]','','g')=$3)
            )
          LIMIT 1`,
        [req.user.companyId, query, digits]
      );
      if (!result.rows.length) {
        return res.status(404).json({ success: false, found: false, message: "Account not found — you can continue as a guest" });
      }
      res.json({ success: true, found: true, data: result.rows[0] });
    } catch (error) {
      console.error("OneKiosk customer lookup error:", error);
      res.status(500).json({ success: false, message: "Unable to look up rewards account" });
    }
  });

  router.post("/kiosk/receipt/print", authenticate, async (req, res) => {
    const saleId = String(req.body?.saleId || "").trim();
    const deviceKey = String(req.body?.deviceKey || req.user?.kioskDeviceKey || "").trim();
    if (!saleId || !deviceKey) return res.status(400).json({ success: false, message: "Sale and kiosk device are required" });
    if (req.user?.mode === "kiosk" && String(req.user.kioskDeviceKey || "") !== deviceKey) {
      return res.status(403).json({ success: false, message: "This kiosk session belongs to another device" });
    }
    try {
      const owned = await db(
        `SELECT s.*,kd.id AS kiosk_device_id,kd.printer_connector_id,
                rc.till_id AS printer_till_id
           FROM sales s
           JOIN kiosk_devices kd
             ON kd.company_id=s.company_id AND kd.store_id=s.store_id AND kd.device_key=$3
           JOIN online_orders o
             ON o.company_id=s.company_id AND o.platform='one_kiosk'
            AND o.platform_data->>'saleId'=s.id::text
            AND o.platform_data->>'kioskDeviceId'=kd.id::text
           LEFT JOIN integration_connections rc
             ON rc.id=kd.printer_connector_id AND rc.company_id=kd.company_id
          WHERE s.id=$1 AND s.company_id=$2
          LIMIT 1`,
        [saleId, req.user.companyId, deviceKey]
      );
      const sale = owned.rows[0];
      if (!sale) return res.status(404).json({ success: false, message: "Receipt is not available for this kiosk order" });
      if (!sale.printer_connector_id) {
        return res.status(409).json({ success: false, code: "LOCAL_PRINT_FALLBACK", message: "No One Connect receipt printer is assigned to this kiosk" });
      }
      const result = await executeConnectorWorkflowAction({
        db,
        req,
        companyId: req.user.companyId,
        storeId: req.user.storeId,
        tillId: sale.printer_till_id || null,
        connectorDrivers,
        writeAudit,
        actorUserId: req.user.id || null,
        action: {
          key: "PRINT_RECEIPT",
          connectorInstanceId: sale.printer_connector_id,
          capability: "printer.print",
          saleId: sale.id,
          receiptNumber: sale.receipt_number,
          payload: {
            connectorInstanceId: sale.printer_connector_id,
            saleId: sale.id,
            receiptNumber: sale.receipt_number,
            sale,
          },
        },
      });
      if (!result?.success) {
        return res.status(502).json({ success: false, code: result?.code || "PRINT_FAILED", message: result?.message || "Receipt printer is unavailable" });
      }
      await writeAudit?.(req.user.companyId, req.user.id || null, "KIOSK_RECEIPT_PRINTED", "sale", saleId, { kioskDeviceId: sale.kiosk_device_id, connectorInstanceId: sale.printer_connector_id });
      res.json({ success: true, message: "Receipt sent to printer", data: result.result || null });
    } catch (error) {
      console.error("OneKiosk receipt print error:", error);
      res.status(500).json({ success: false, message: "Unable to print receipt" });
    }
  });

  router.post("/kiosk/receipt/email", authenticate, async (req, res) => {
    const saleId = String(req.body?.saleId || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 255);
    const deviceKey = String(req.body?.deviceKey || req.user?.kioskDeviceKey || "").trim();
    if (!saleId || !deviceKey) return res.status(400).json({ success: false, message: "Sale and kiosk device are required" });
    if (req.user?.mode === "kiosk" && String(req.user.kioskDeviceKey || "") !== deviceKey) {
      return res.status(403).json({ success: false, message: "This kiosk session belongs to another device" });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: "Enter a valid email address" });
    }
    try {
      const owned = await db(
        `SELECT s.id,s.customer_id,c.email AS customer_email,kd.id AS kiosk_device_id
           FROM sales s
           JOIN kiosk_devices kd
             ON kd.company_id=s.company_id AND kd.store_id=s.store_id AND kd.device_key=$3
           JOIN online_orders o
             ON o.company_id=s.company_id
            AND o.platform='one_kiosk'
            AND o.platform_data->>'saleId'=s.id::text
            AND o.platform_data->>'kioskDeviceId'=kd.id::text
           LEFT JOIN customers c ON c.id=s.customer_id AND c.company_id=s.company_id
          WHERE s.id=$1 AND s.company_id=$2
          LIMIT 1`,
        [saleId, req.user.companyId, deviceKey]
      );
      if (!owned.rows.length) {
        return res.status(404).json({ success: false, message: "Receipt is not available for this kiosk order" });
      }
      const recipient = email || owned.rows[0].customer_email || "";
      if (!recipient) return res.status(400).json({ success: false, message: "Enter an email address for the receipt" });
      const result = await resendInvoiceByChannel({
        db,
        channel: "email",
        saleId,
        companyId: req.user.companyId,
        storeId: req.user.storeId || null,
        userId: req.user.id || null,
        overrideRecipient: recipient,
      });
      if (!result?.ok) {
        const message = result?.reason === "not_configured"
          ? "Email receipt delivery is not configured for this business"
          : result?.error || result?.reason || "Email receipt could not be sent";
        return res.status(result?.reason === "not_configured" ? 409 : 502).json({ success: false, message });
      }
      await writeAudit?.(req.user.companyId, req.user.id || null, "KIOSK_RECEIPT_EMAILED", "sale", saleId, {
        kioskDeviceId: owned.rows[0].kiosk_device_id,
      });
      res.json({ success: true, message: "Receipt sent by email" });
    } catch (error) {
      console.error("OneKiosk email receipt error:", error);
      res.status(500).json({ success: false, message: "Unable to send email receipt" });
    }
  });

  router.get("/kiosk/orders/search", authenticate, async (req, res) => {
    if (req.user?.mode === "kiosk") return res.status(403).json({ success: false, message: "Staff access required" });
    const query = String(req.query?.q || "").trim().slice(0, 120);
    const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 20));
    try {
      const numeric = Number(query.replace(/[^0-9.]/g, ""));
      const result = await db(
        `SELECT o.id,o.external_order_id,o.external_reference,o.status,o.fulfilment_type,o.created_at,o.updated_at,
                o.store_id,o.platform_data,
                s.id AS sale_id,s.receipt_number,s.total,s.created_at AS sale_created_at,
                kd.id AS kiosk_device_id,kd.name AS kiosk_name,kd.device_key
           FROM online_orders o
           LEFT JOIN sales s
             ON s.company_id=o.company_id
            AND s.id::text=o.platform_data->>'saleId'
           LEFT JOIN kiosk_devices kd
             ON kd.company_id=o.company_id
            AND kd.id::text=o.platform_data->>'kioskDeviceId'
          WHERE o.company_id=$1
            AND o.platform='one_kiosk'
            AND (
              $2='' OR
              LOWER(COALESCE(o.external_reference,'')) LIKE LOWER('%'||$2||'%') OR
              LOWER(COALESCE(o.external_order_id,'')) LIKE LOWER('%'||$2||'%') OR
              LOWER(COALESCE(s.receipt_number,'')) LIKE LOWER('%'||$2||'%') OR
              LOWER(COALESCE(kd.name,'')) LIKE LOWER('%'||$2||'%') OR
              LOWER(COALESCE(kd.device_key,'')) LIKE LOWER('%'||$2||'%') OR
              ($3::numeric IS NOT NULL AND ABS(COALESCE(s.total,0)-$3::numeric) < 0.005)
            )
          ORDER BY o.created_at DESC
          LIMIT $4`,
        [req.user.companyId, query, Number.isFinite(numeric) && query ? numeric : null, limit]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Search OneKiosk orders error:", error);
      res.status(500).json({ success: false, message: "Unable to search kiosk orders" });
    }
  });

  router.get("/kiosk/flows", authenticate, async (req, res) => {
    try {
      const displayFlowId = req.user?.mode === "kiosk_display" ? req.user.kioskDisplayFlowId || null : null;
      const result = await db(
        `SELECT id,name,trigger_key,conditions,action,active,lifecycle_status,version,
                managed,user_modified,source_package_version,updated_at
           FROM platform_rules
          WHERE company_id=$1
            AND action->>'scope'='one_kiosk'
            AND action->>'flowType'='KIOSK_EXPERIENCE'
            AND active=TRUE
            AND lifecycle_status='ACTIVE'
            AND ($2::uuid IS NULL OR id=$2::uuid)
          ORDER BY
            CASE WHEN action->>'defaultForNewDevices'='true' THEN 0 ELSE 1 END,
            name`,
        [req.user.companyId, displayFlowId]
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
        `SELECT kd.id,kd.device_key,kd.name,kd.workflow_id,kd.payment_connector_id,kd.printer_connector_id,
                kd.age_approval_requested_at,kd.age_approved_until,kd.age_approved_by,
                kd.printer_name,kd.printer_connection_type,kd.printer_connection_address,
                kd.printer_paper_width,kd.printer_required,kd.printer_status,
                pc.name AS payment_connector_name,pc.connector_package_key,
                pc.enabled AS payment_connector_enabled,pc.connection_status AS payment_connector_status,
                pc.last_error AS payment_connector_error,pc.last_connected_at AS payment_connector_last_connected_at,
                pc.till_id AS payment_connector_till_id,
                rc.name AS printer_connector_name,rc.connector_package_key AS printer_connector_package_key,
                rc.enabled AS printer_connector_enabled,rc.connection_status AS printer_connector_status,
                rc.last_error AS printer_connector_error,rc.last_connected_at AS printer_connector_last_connected_at,
                pr.id AS flow_id,pr.name AS flow_name,pr.version AS flow_version,
                pr.action AS flow_action,pr.lifecycle_status AS flow_status
           FROM kiosk_devices kd
           LEFT JOIN integration_connections pc
             ON pc.id=kd.payment_connector_id
            AND pc.company_id=kd.company_id
           LEFT JOIN integration_connections rc
             ON rc.id=kd.printer_connector_id
            AND rc.company_id=kd.company_id
           LEFT JOIN platform_rules pr
             ON pr.id=kd.workflow_id
            AND pr.company_id=kd.company_id
            AND pr.action->>'scope'='one_kiosk'
            AND pr.action->>'flowType'='KIOSK_EXPERIENCE'
            AND pr.active=TRUE
            AND pr.lifecycle_status='ACTIVE'
          WHERE kd.company_id=$1 AND kd.store_id=$2 AND kd.device_key=$3 AND kd.active=TRUE
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
          device: {
            id: device.id,
            deviceKey: device.device_key,
            name: device.name,
            ageApprovalRequestedAt: device.age_approval_requested_at || null,
            ageApprovedUntil: device.age_approved_until || null,
            ageApproved: Boolean(device.age_approved_until && new Date(device.age_approved_until).getTime() > Date.now()),
          },
          printer: {
            connectorInstanceId: device.printer_connector_id || null,
            connectorName: device.printer_connector_name || null,
            connectorPackageKey: device.printer_connector_package_key || null,
            name: device.printer_name || device.printer_connector_name || null,
            connectionType: device.printer_connection_type || (device.printer_connector_id ? "CONNECTOR" : null),
            address: device.printer_connection_address || null,
            paperWidth: device.printer_paper_width || "80mm",
            required: device.printer_required === true,
            status: device.printer_connector_id
              ? device.printer_connector_enabled !== true
                ? "NOT_CONFIGURED"
                : device.printer_connector_status === "CONNECTED"
                  ? "READY"
                  : device.printer_connector_status || "UNKNOWN"
              : device.printer_name
                ? (device.printer_status || "UNKNOWN")
                : "NOT_CONFIGURED",
            error: device.printer_connector_error || null,
            lastConnectedAt: device.printer_connector_last_connected_at || null,
          },
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

  router.get("/kiosk/printer-connectors", authenticate, async (req, res) => {
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
            AND (
              c.connector_capabilities ? 'printer.print'
              OR EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(COALESCE(p.manifest->'connectorApp'->'capabilities','[]'::jsonb)) cap
                 WHERE CASE
                   WHEN jsonb_typeof(cap)='string' THEN trim(both '"' from cap::text)
                   ELSE cap->>'key'
                 END = 'printer.print'
              )
            )
          ORDER BY c.name`,
        [req.user.companyId, req.user.storeId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load OneKiosk printer connectors error:", error);
      res.status(500).json({ success: false, message: "Unable to load kiosk printer connectors" });
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
                rc.name AS printer_connector_name,
                rc.connector_package_key AS printer_connector_package_key,
                rc.connection_status AS printer_connector_status,
                rc.last_error AS printer_connector_error,
                rc.last_connected_at AS printer_connector_last_connected_at,
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
                  WHEN kd.printer_connector_id IS NOT NULL AND rc.enabled IS FALSE THEN 'OFFLINE'
                  WHEN kd.printer_connector_id IS NOT NULL AND rc.connection_status='CONNECTED' THEN 'READY'
                  WHEN kd.printer_connector_id IS NOT NULL AND rc.connection_status IN ('ERROR','DISCONNECTED','DISABLED') THEN 'OFFLINE'
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
                  WHEN kd.printer_required AND (
                    (kd.printer_connector_id IS NOT NULL AND (rc.enabled IS FALSE OR COALESCE(rc.connection_status,'') <> 'CONNECTED'))
                    OR (kd.printer_connector_id IS NULL AND ((NULLIF(kd.printer_name,'') IS NULL AND kd.printer_hardware_id IS NULL) OR (hc.id IS NOT NULL AND hc.active IS FALSE) OR kd.printer_status NOT IN ('READY','ONLINE')))
                  ) THEN 'DEGRADED'
                  ELSE 'ONLINE'
                END AS overall_status
           FROM kiosk_devices kd
           LEFT JOIN integration_connections pc ON pc.id=kd.payment_connector_id AND pc.company_id=kd.company_id
           LEFT JOIN integration_connections rc ON rc.id=kd.printer_connector_id AND rc.company_id=kd.company_id
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
    const printerConnectorId = req.body?.printerConnectorId || null;
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
      if (printerConnectorId) {
        const connector = await db(
          `SELECT c.id,c.till_id
             FROM integration_connections c
             JOIN package_registry p ON p.package_key=c.connector_package_key AND p.active=TRUE
            WHERE c.id=$1 AND c.company_id=$2 AND c.enabled=TRUE
              AND (c.store_id IS NULL OR c.store_id=$3)
              AND (
                c.connector_capabilities ? 'printer.print'
                OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(COALESCE(p.manifest->'connectorApp'->'capabilities','[]'::jsonb)) cap
                   WHERE CASE WHEN jsonb_typeof(cap)='string' THEN trim(both '"' from cap::text) ELSE cap->>'key' END='printer.print'
                )
              )`,
          [printerConnectorId, req.user.companyId, req.user.storeId]
        );
        if (!connector.rows.length) return res.status(400).json({ success: false, message: "Printer connector is not available for this store" });
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
            SET name=$1,workflow_id=$2,payment_connector_id=$3,printer_connector_id=$4,payment_terminal_id=$5,printer_hardware_id=$6,
                printer_name=$7,printer_connection_type=$8,printer_connection_address=$9,printer_paper_width=$10,
                payment_required=$11,printer_required=$12,active=$13,updated_at=NOW()
          WHERE id=$14 AND company_id=$15 AND store_id=$16
          RETURNING *`,
        [name, workflowId, paymentConnectorId, printerConnectorId, paymentTerminalId, printerHardwareId, printerName, printerConnectionType, printerConnectionAddress, printerPaperWidth, paymentRequired, printerRequired, active, req.params.id, req.user.companyId, req.user.storeId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device not found" });
      await writeAudit?.(req.user.companyId, req.user.id, "kiosk.device.settings", "kiosk_device", req.params.id, {
        workflowId, paymentConnectorId, printerConnectorId, paymentTerminalId, printerHardwareId, printerName, printerConnectionType, printerConnectionAddress, printerPaperWidth, paymentRequired, printerRequired, active,
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
    const fulfilmentDetails = req.body?.fulfilmentDetails && typeof req.body.fulfilmentDetails === "object"
      ? req.body.fulfilmentDetails
      : {};
    const requestedFulfilmentStoreId = fulfilmentDetails.storeId || req.body?.fulfilmentStoreId || null;

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

    let fulfilmentStoreId = req.user.storeId;
    if (requestedFulfilmentStoreId) {
      const targetStore = await db(
        "SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=TRUE",
        [requestedFulfilmentStoreId, req.user.companyId]
      );
      if (!targetStore.rows.length) {
        return res.status(400).json({ success: false, message: "Selected collection store is unavailable" });
      }
      fulfilmentStoreId = targetStore.rows[0].id;
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query("BEGIN");
      transactionStarted = true;

      const saleResult = await client.query(
        `SELECT s.id,s.company_id,s.store_id,s.user_id,s.customer_id,s.receipt_number,
                s.subtotal,s.tax,s.total,s.status,s.created_at,c.currency
           FROM sales s
           JOIN companies c ON c.id=s.company_id
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
           'PREPARING',$6,$7,$8,$9,0,$10,$11,
           $12,'paid',$13::jsonb,FALSE,
           NOW(),NOW()
         )
         RETURNING *`,
        [
          req.user.companyId,
          fulfilmentStoreId,
          sale.customer_id || null,
          externalOrderId,
          collectionNumber,
          canonicalFulfilmentType,
          String(sale.currency || "GBP").toUpperCase(),
          Number(sale.subtotal) || 0,
          Number(sale.tax) || 0,
          Number(sale.total) || 0,
          `Paid at OneKiosk. Sale ${sale.receipt_number}.`,
          paymentRow.payment_method || "card",
          JSON.stringify({
            source: "ONE_KIOSK",
            requestedFulfilmentType: fulfilmentType,
            fulfilmentDetails,
            orderingStoreId: req.user.storeId,
            fulfilmentStoreId,
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
            storeId: fulfilmentStoreId,
            orderingStoreId: req.user.storeId,
          })
        ).catch(() => {});
      }

      return res.status(201).json({
        success: true,
        message: "Payment complete — order sent for collection",
        data: {
          order,
          saleId: sale.id,
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
    if (!["kiosk","kiosk_display"].includes(payload?.mode)) return next();

    const path = String(req.originalUrl || req.url || "").split("?")[0];
    const method = String(req.method || "GET").toUpperCase();

    if (payload?.mode === "kiosk_display") {
      const displayAllowed =
        (method === "GET" && path === "/api/kiosk/flows") ||
        (method === "GET" && path === "/api/online/orders" && String(req.query?.platform || "") === "one_kiosk");
      if (displayAllowed) return next();
      return res.status(403).json({
        success: false,
        message: "Not available in OneKiosk display mode",
      });
    }

    const allowed =
      (method === "GET" && path === "/api/health") ||
      (method === "GET" && path === "/api/settings") ||
      (method === "GET" && path === "/api/kiosk/runtime") ||
      (method === "GET" && path === "/api/kiosk/catalogue") ||
      (method === "GET" && /^\/api\/kiosk\/products\/[^/]+\/options$/.test(path)) ||
      (method === "POST" && path === "/api/kiosk/quote") ||
      (method === "POST" && path === "/api/kiosk/availability") ||
      (method === "POST" && path === "/api/kiosk/assistance") ||
      (method === "POST" && path === "/api/kiosk/age-approval/request") ||
      (method === "POST" && path === "/api/kiosk/customer-lookup") ||
      (method === "POST" && path === "/api/kiosk/receipt/email") ||
      (method === "POST" && path === "/api/kiosk/receipt/print") ||
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
