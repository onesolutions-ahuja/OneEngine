import express from "express";

/*
 * OneKiosk fulfilment bridge.
 *
 * Payment and stock remain authoritative in the normal Sales engine. After a
 * successful kiosk sale, this route creates a provider-neutral fulfilment
 * record from the committed sale WITHOUT reserving/deducting stock again.
 */
export default function createKioskRouter({ authenticate, authorize, db, pool, writeAudit }) {
  const router = express.Router();

  const normaliseHealth = (value) => {
    const key = String(value || "UNKNOWN").trim().toUpperCase();
    return ["ONLINE","OFFLINE","DEGRADED","READY","ERROR","NOT_CONFIGURED","UNKNOWN"].includes(key) ? key : "UNKNOWN";
  };

  router.get("/kiosk/devices", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT kd.*,
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
                  WHEN kd.last_heartbeat_at IS NULL THEN 'OFFLINE'
                  WHEN kd.last_heartbeat_at < NOW() - INTERVAL '60 seconds' THEN 'OFFLINE'
                  WHEN kd.internet_status = 'OFFLINE' OR kd.server_status = 'OFFLINE' THEN 'OFFLINE'
                  WHEN kd.payment_required AND kd.payment_status NOT IN ('READY','ONLINE') THEN 'DEGRADED'
                  WHEN kd.printer_required AND kd.printer_status NOT IN ('READY','ONLINE') THEN 'DEGRADED'
                  ELSE 'ONLINE'
                END AS overall_status
           FROM kiosk_devices kd
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
      const result = await db(
        `INSERT INTO kiosk_devices (company_id,store_id,device_key,name,last_heartbeat_at,updated_at)
         VALUES ($1,$2,$3,$4,NOW(),NOW())
         ON CONFLICT (company_id,device_key)
         DO UPDATE SET store_id=EXCLUDED.store_id,name=COALESCE(NULLIF(kiosk_devices.name,''),EXCLUDED.name),last_heartbeat_at=NOW(),updated_at=NOW()
         RETURNING *`,
        [req.user.companyId, req.user.storeId, deviceKey, name]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Register kiosk device error:", error);
      res.status(500).json({ success: false, message: "Unable to register kiosk device" });
    }
  });

  router.put("/kiosk/devices/:id/settings", authenticate, async (req, res) => {
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
            SET name=$1,payment_terminal_id=$2,printer_hardware_id=$3,
                printer_name=$4,printer_connection_type=$5,printer_connection_address=$6,printer_paper_width=$7,
                payment_required=$8,printer_required=$9,active=$10,updated_at=NOW()
          WHERE id=$11 AND company_id=$12 AND store_id=$13
          RETURNING *`,
        [name, paymentTerminalId, printerHardwareId, printerName, printerConnectionType, printerConnectionAddress, printerPaperWidth, paymentRequired, printerRequired, active, req.params.id, req.user.companyId, req.user.storeId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kiosk device not found" });
      await writeAudit?.(req.user.companyId, req.user.id, "kiosk.device.settings", "kiosk_device", req.params.id, {
        paymentTerminalId, printerHardwareId, printerName, printerConnectionType, printerConnectionAddress, printerPaperWidth, paymentRequired, printerRequired, active,
      });
      res.json({ success: true, message: "Kiosk device settings saved", data: result.rows[0] });
    } catch (error) {
      console.error("Save kiosk device settings error:", error);
      res.status(500).json({ success: false, message: "Unable to save kiosk device settings" });
    }
  });

  router.post("/kiosk/devices/:id/heartbeat", authenticate, async (req, res) => {
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
    const fulfilmentType = String(req.body?.fulfilmentType || "COLLECT").trim().toUpperCase();
    const allowedFulfilment = new Set(["COLLECT", "TAKEAWAY", "EAT_IN", "COUNTER_SERVICE"]);

    if (!saleId) {
      return res.status(400).json({ success: false, message: "A completed sale is required" });
    }
    if (!allowedFulfilment.has(fulfilmentType)) {
      return res.status(400).json({ success: false, message: "Unsupported kiosk fulfilment type" });
    }

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

      const canonicalFulfilmentType = "SELF_PICKUP";

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
