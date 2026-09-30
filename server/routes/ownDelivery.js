import express from "express";
import { GENERIC_ORDER_STATUSES } from "../services/onlineOrders/genericOrderTypes.js";
import { transitionGenericOrder } from "../services/onlineOrders/genericOrderService.js";
import { createSaleForCompletedOrder } from "../services/onlineOrders/saleCreator.js";

const DRIVER_ACTIONS = Object.freeze({
  accept: GENERIC_ORDER_STATUSES.DRIVER_ACCEPTED,
  collected: GENERIC_ORDER_STATUSES.COLLECTED,
  start: GENERIC_ORDER_STATUSES.OUT_FOR_DELIVERY,
  delivered: GENERIC_ORDER_STATUSES.COMPLETED,
  failed: GENERIC_ORDER_STATUSES.FAILED_DELIVERY,
});

export default function createOwnDeliveryRouter({
  authenticate,
  authorize,
  db,
  pool,
  canAccessStore,
  createInventoryMovement,
  writeAudit,
}) {
  const router = express.Router();

  async function hasStoreAccess(user, storeId) {
    if (!storeId) return false;
    if (typeof canAccessStore === "function") return canAccessStore(user, storeId);
    const result = await db(
      `SELECT 1 FROM users u JOIN stores s ON s.company_id=u.company_id
        WHERE u.id=$1 AND u.company_id=$2 AND s.id=$3 AND s.active=true
          AND (u.store_id=s.id OR EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id=u.id AND us.store_id=s.id AND us.active=true))`,
      [user.id, user.companyId, storeId]
    );
    return result.rows.length > 0;
  }

  async function audit(req, action, orderId, metadata = {}) {
    if (typeof writeAudit?.object === "function") {
      await writeAudit.object({
        companyId: req.user.companyId,
        userId: req.user.id,
        storeId: metadata.storeId || req.user.storeId || null,
        action,
        entityType: "online_order",
        entityId: orderId,
        metadata,
      });
    }
  }

  router.get("/own-delivery/stores", authenticate, authorize("online_orders.view"), async (req, res) => {
    try {
      const result = await db("SELECT id,name FROM stores WHERE company_id=$1 AND active=true ORDER BY name", [req.user.companyId]);
      const visible = [];
      for (const store of result.rows) {
        if (await hasStoreAccess(req.user, store.id)) visible.push(store);
      }
      res.json({ success: true, data: visible });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load accessible stores" });
    }
  });

  router.get("/own-delivery/drivers", authenticate, authorize("online_orders.manage"), async (req, res) => {
    const storeId = String(req.query.storeId || req.user.storeId || "").trim();
    try {
      if (!storeId || !(await hasStoreAccess(req.user, storeId))) {
        return res.status(403).json({ success: false, message: "You do not have access to this store" });
      }
      const result = await db(
        `SELECT DISTINCT u.id,u.full_name,u.username,u.store_id
           FROM users u
           JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id
           JOIN role_permissions rp ON rp.role_id=r.id
           JOIN permissions p ON p.id=rp.permission_id AND p.code='delivery.driver'
          WHERE u.company_id=$1 AND u.active=true
            AND (u.store_id=$2 OR EXISTS (
              SELECT 1 FROM user_stores us WHERE us.user_id=u.id AND us.store_id=$2 AND us.active=true
            ))
          ORDER BY u.full_name,u.username`,
        [req.user.companyId, storeId]
      );
      res.json({ success: true, data: result.rows.map(({ id, full_name, username }) => ({ id, name: full_name, username })) });
    } catch (error) {
      console.error("Own delivery drivers error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load delivery partners" });
    }
  });

  router.get("/own-delivery/orders", authenticate, authorize("online_orders.view"), async (req, res) => {
    const storeId = String(req.query.storeId || req.user.storeId || "").trim();
    try {
      if (!storeId) return res.status(400).json({ success: false, message: "Select a store to view its delivery queue" });
      if (!(await hasStoreAccess(req.user, storeId))) {
        return res.status(403).json({ success: false, message: "You do not have access to this store" });
      }
      const result = await db(
        `SELECT o.id,o.company_id,o.store_id,o.external_reference,o.status,o.fulfilment_type,
                o.customer_name,o.customer_phone,o.delivery_address,o.notes,o.delivery_fee,o.total,
                o.delivery_driver_id,o.delivery_assigned_at,o.delivery_route_order,o.delivery_status_note,
                o.created_at,s.name AS store_name,u.full_name AS driver_name,
                COALESCE(lines.items,'[]'::jsonb) AS items
           FROM online_orders o
           LEFT JOIN stores s ON s.id=o.store_id AND s.company_id=o.company_id
           LEFT JOIN users u ON u.id=o.delivery_driver_id AND u.company_id=o.company_id
           LEFT JOIN LATERAL (
             SELECT jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity) ORDER BY i.created_at,i.id) AS items
               FROM online_order_items i WHERE i.order_id=o.id
           ) lines ON true
          WHERE o.company_id=$1 AND o.platform='client_web_shop' AND o.fulfilment_type='OWN_DELIVERY'
            AND ($2::uuid IS NULL OR o.store_id=$2)
          ORDER BY CASE WHEN o.delivery_driver_id IS NULL THEN 0 ELSE 1 END,o.delivery_route_order NULLS LAST,o.created_at`,
        [req.user.companyId, storeId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Own delivery queue error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load delivery orders" });
    }
  });

  router.put("/own-delivery/orders/:orderId/assignment", authenticate, authorize("online_orders.manage"), async (req, res) => {
    const driverId = String(req.body?.driverId || "").trim();
    if (!driverId) return res.status(400).json({ success: false, message: "Select a delivery partner" });
    const client = await (req.tenantPool || pool).connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT id,store_id,status FROM online_orders
          WHERE id=$1 AND company_id=$2 AND platform='client_web_shop' AND fulfilment_type='OWN_DELIVERY' FOR UPDATE`,
        [req.params.orderId, req.user.companyId]
      );
      if (!found.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ success: false, message: "Own-delivery order not found" });
      }
      const order = found.rows[0];
      if (!(await hasStoreAccess(req.user, order.store_id))) {
        await client.query("ROLLBACK");
        return res.status(403).json({ success: false, message: "You do not have access to this store" });
      }
      if (["COMPLETED", "CANCELLED", "REJECTED", "FAILED_DELIVERY", "RETURNED"].includes(order.status)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ success: false, message: "A closed delivery cannot be assigned" });
      }
      const eligible = await client.query(
        `SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id AND r.company_id=u.company_id
          JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id AND p.code='delivery.driver'
          WHERE u.id=$1 AND u.company_id=$2 AND u.active=true
            AND (u.store_id=$3 OR EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id=u.id AND us.store_id=$3 AND us.active=true))`,
        [driverId, req.user.companyId, order.store_id]
      );
      if (!eligible.rows.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ success: false, message: "Delivery partner is not active or assigned to this store" });
      }
      const updated = await client.query(
        `UPDATE online_orders SET delivery_driver_id=$1,delivery_assigned_by=$2,delivery_assigned_at=NOW(),
                delivery_route_order=COALESCE(delivery_route_order,(SELECT COALESCE(MAX(o.delivery_route_order),0)+1 FROM online_orders o WHERE o.company_id=$3 AND o.store_id=$4 AND o.delivery_driver_id=$1)),updated_at=NOW()
          WHERE id=$5 AND company_id=$3 RETURNING id,store_id,delivery_driver_id,delivery_assigned_at,delivery_route_order`,
        [driverId, req.user.id, req.user.companyId, order.store_id, req.params.orderId]
      );
      await client.query("COMMIT");
      await audit(req, "own_delivery.assignment.changed", order.id, { storeId: order.store_id, driverId });
      res.json({ success: true, data: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("Own delivery assignment error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to assign delivery partner" });
    } finally {
      client.release();
    }
  });

  router.get("/own-delivery/my-jobs", authenticate, authorize("delivery.driver"), async (req, res) => {
    try {
      const result = await db(
        `SELECT o.id,o.external_reference,o.status,o.fulfilment_type,o.customer_name,o.customer_phone,
                o.delivery_address,o.notes AS delivery_notes,o.delivery_status_note,o.delivery_route_order,
                o.created_at,s.name AS store_name,s.address_line1 AS store_address,
                COALESCE(lines.items,'[]'::jsonb) AS items
           FROM online_orders o
           JOIN users me ON me.id=$2 AND me.company_id=o.company_id AND me.active=true
           JOIN stores s ON s.id=o.store_id AND s.company_id=o.company_id AND s.active=true
           LEFT JOIN LATERAL (
             SELECT jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity) ORDER BY i.created_at,i.id) AS items
               FROM online_order_items i WHERE i.order_id=o.id
           ) lines ON true
          WHERE o.company_id=$1 AND o.delivery_driver_id=$2 AND o.platform='client_web_shop'
            AND o.fulfilment_type='OWN_DELIVERY'
            AND (me.store_id=o.store_id OR EXISTS (SELECT 1 FROM user_stores us WHERE us.user_id=me.id AND us.store_id=o.store_id AND us.active=true))
            AND o.status NOT IN ('COMPLETED','CANCELLED','REJECTED','RETURNED')
          ORDER BY o.delivery_route_order NULLS LAST,o.created_at`,
        [req.user.companyId, req.user.id]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Driver own-delivery jobs error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load assigned deliveries" });
    }
  });

  router.put("/own-delivery/my-jobs/route", authenticate, authorize("delivery.driver"), async (req, res) => {
    const ids = Array.isArray(req.body?.orderIds) ? req.body.orderIds.map(String) : [];
    if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length) {
      return res.status(400).json({ success: false, message: "Provide a valid ordered list of assigned deliveries" });
    }
    const client = await (req.tenantPool || pool).connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query(
        `SELECT o.id FROM online_orders o JOIN users u ON u.id=$2 AND u.company_id=o.company_id AND u.active=true
          WHERE o.company_id=$1 AND o.delivery_driver_id=$2 AND o.platform='client_web_shop' AND o.fulfilment_type='OWN_DELIVERY'
            AND o.id=ANY($3::uuid[]) AND (u.store_id=o.store_id OR EXISTS(SELECT 1 FROM user_stores us WHERE us.user_id=u.id AND us.store_id=o.store_id AND us.active=true))
            AND o.status NOT IN ('COMPLETED','CANCELLED','REJECTED','RETURNED') FOR UPDATE`,
        [req.user.companyId, req.user.id, ids]
      );
      if (owned.rows.length !== ids.length) {
        await client.query("ROLLBACK");
        return res.status(403).json({ success: false, message: "Route contains a delivery not assigned to you" });
      }
      for (const [index, id] of ids.entries()) {
        await client.query("UPDATE online_orders SET delivery_route_order=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 AND delivery_driver_id=$4", [index + 1, id, req.user.companyId, req.user.id]);
      }
      await client.query("COMMIT");
      res.json({ success: true, data: { orderIds: ids } });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ success: false, message: "Unable to save route order" });
    } finally {
      client.release();
    }
  });

  router.post("/own-delivery/my-jobs/:orderId/actions", authenticate, authorize("delivery.driver"), async (req, res) => {
    const action = String(req.body?.action || "").toLowerCase();
    const toStatus = DRIVER_ACTIONS[action];
    if (!toStatus) return res.status(400).json({ success: false, message: "Invalid delivery action" });
    try {
      const access = await db(
        `SELECT o.store_id FROM online_orders o JOIN users u ON u.id=$3 AND u.company_id=o.company_id AND u.active=true
          WHERE o.id=$1 AND o.company_id=$2 AND o.delivery_driver_id=$3 AND o.platform='client_web_shop' AND o.fulfilment_type='OWN_DELIVERY'
            AND (u.store_id=o.store_id OR EXISTS(SELECT 1 FROM user_stores us WHERE us.user_id=u.id AND us.store_id=o.store_id AND us.active=true))`,
        [req.params.orderId, req.user.companyId, req.user.id]
      );
      if (!access.rows.length) return res.status(404).json({ success: false, message: "Assigned delivery not found" });
      const result = await transitionGenericOrder({
        pool,
        companyId: req.user.companyId,
        orderId: req.params.orderId,
        userId: req.user.id,
        toStatus,
        reason: action === "failed" ? String(req.body?.note || "Unable to deliver").slice(0, 500) : null,
        createInventoryMovement,
        createSale: (client, context) => createSaleForCompletedOrder(client, context),
      });
      if (!result.success) return res.status(result.error === "Order not found" ? 404 : 409).json({ success: false, message: result.error });
      const note = String(req.body?.note || "").trim().slice(0, 500) || null;
      if (note) await db("UPDATE online_orders SET delivery_status_note=$1 WHERE id=$2 AND company_id=$3 AND delivery_driver_id=$4", [note, req.params.orderId, req.user.companyId, req.user.id]);
      await audit(req, `own_delivery.${action}`, req.params.orderId, { storeId: access.rows[0].store_id, note });
      res.json({ success: true, data: { orderId: req.params.orderId, status: toStatus } });
    } catch (error) {
      console.error("Own delivery driver action error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to update delivery status" });
    }
  });

  return router;
}