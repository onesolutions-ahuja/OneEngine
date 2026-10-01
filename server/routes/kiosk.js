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
