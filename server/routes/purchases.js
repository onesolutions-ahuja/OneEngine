import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

export default function createPurchasesRouter({
  authenticate,
  authorize,
  db,
  pool,
}) {
  const router = express.Router();

  async function receivePurchase(req, client, purchaseId, companyId, userId, storeId, requestedItems = null, receiptMeta = {}) {
    const execution = await executeSystemWorkflow({
      db,
      companyId,
      userId,
      systemKey: "function:purchase.receive",
      req,
      input: { purchaseId, storeId, requestedItems, receiptMeta },
      storeId,
      source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "purchase.receive" },
      extraContext: {
        client,
        businessDb: (query, params = []) => client.query(query, params),
      },
    });
    return execution.result;
  }

  /*
   * GET /api/purchases
   */
  router.get(
    "/purchases",
    authenticate,
    authorize("purchase.view", "reports.purchases.view", "inventory.view"),
    async (req, res) => {
      try {
        const result = await db(
          `
          SELECT
            p.id,
            p.reference_number,
            p.supplier_id,
            p.supplier_name,
            p.store_id,
            s.name AS store_name,
            p.purchase_date,
            p.status,
            p.total,
            p.created_by,
            u.username AS created_by_username,
            p.created_at
          FROM purchases p
          LEFT JOIN stores s ON s.id = p.store_id
          LEFT JOIN users u ON u.id = p.created_by
          WHERE p.company_id = $1
          ORDER BY p.purchase_date DESC, p.created_at DESC
          `,
          [req.user.companyId]
        );

        res.json({ success: true, data: result.rows });
      } catch (error) {
        console.error("Load purchases error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load purchases" });
      }
    }
  );

  /*
   * GET /api/purchases/:id
   */
  router.get(
    "/purchases/:id",
    authenticate,
    authorize("purchase.view", "inventory.view"),
    async (req, res) => {
      try {
        const purchase = await db(
          `
          SELECT p.*, s.name AS store_name, u.username AS created_by_username,
            r.username AS received_by_username
          FROM purchases p
          LEFT JOIN stores s ON s.id = p.store_id
          LEFT JOIN users u ON u.id = p.created_by
          LEFT JOIN users r ON r.id = p.received_by
          WHERE p.id = $1 AND p.company_id = $2
          `,
          [req.params.id, req.user.companyId]
        );

        if (!purchase.rows.length) {
          return res
            .status(404)
            .json({ success: false, message: "Purchase not found" });
        }

        const items = await db(
          `
          SELECT pi.*, p.name AS product_name, p.sku, p.barcode,
            (pi.quantity - pi.received_quantity) AS remaining_quantity
          FROM purchase_items pi
          INNER JOIN products p ON p.id = pi.product_id
          WHERE pi.purchase_id = $1
          ORDER BY pi.id
          `,
          [req.params.id]
        );

        const movements = await db(
          `
          SELECT id, product_id, movement_type, quantity_change, balance_after,
            reason, reference_type, reference_id, created_by, created_at
          FROM inventory_movements
          WHERE reference_type = 'PURCHASE' AND reference_id = $1
          ORDER BY created_at, id
          `,
          [req.params.id]
        );
        const receipts = await db(
          `SELECT pr.id, pr.received_at, pr.reference_number, pr.notes, u.username AS received_by_username
             FROM purchase_receipts pr LEFT JOIN users u ON u.id=pr.received_by
            WHERE pr.purchase_id=$1 AND pr.company_id=$2 ORDER BY pr.received_at`,
          [req.params.id, req.user.companyId]
        );

        res.json({
          success: true,
          data: { ...purchase.rows[0], items: items.rows, movements: movements.rows, receipts: receipts.rows },
        });
      } catch (error) {
        console.error("Get purchase error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load purchase" });
      }
    }
  );

  /*
   * POST /api/purchases
   */
  router.post(
    "/purchases",
    authenticate,
    authorize("purchase.create", "inventory.adjust"),
    async (req, res) => {
      try {
        const receiveNow = req.body?.receiveNow === true;
        const storeId = req.body?.storeId || req.user.storeId || null;
        const execution = await executeSystemWorkflow({
          db,
          companyId: req.user.companyId,
          userId: req.user.id || null,
          systemKey: "function:purchase.create",
          req,
          input: { ...req.body, receiveNow, storeId },
          storeId,
          source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "purchase.create" },
          extraContext: { pool },
        });
        const purchaseId = execution.result?.id;
        res.status(201).json({
          success: true,
          message: receiveNow ? "Stock received" : "Purchase created",
          data: { id: purchaseId },
        });
      } catch (error) {
        console.error("Create purchase error:", error);
        res
          .status(error.code === "DUPLICATE_PURCHASE" || error.code === "23505" ? 409 : 400)
          .json({ success: false, message: error.message });
      }
    }
  );

  /*
   * POST /api/purchases/:id/receive
   */
  router.post(
    "/purchases/:id/receive",
    authenticate,
    authorize("purchase.edit", "inventory.adjust"),
    async (req, res) => {
      if (!pool) {
        return res
          .status(500)
          .json({ success: false, message: "DATABASE_URL is not configured" });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        await receivePurchase(
          req,
          client,
          req.params.id,
          req.user.companyId,
          req.user.id,
          req.user.storeId,
          Array.isArray(req.body.receiveItems) ? req.body.receiveItems : null,
          { referenceNumber: req.body.receivingReference, notes: req.body.receivingNotes }
        );
        await client.query("COMMIT");

        /* T9G: fire-and-forget integration dispatch (never blocks/throws). */
        executeSystemWorkflow({
          db,
          companyId: req.user.companyId,
          userId: req.user.id || null,
          systemKey: "function:integration.event.dispatch",
          req,
          input: { event: "PURCHASE_RECEIVED", entityId: req.params.id, storeId: req.user.storeId },
          storeId: req.user.storeId,
          source: { type: "domain_event", method: req.method, path: req.originalUrl || req.path, capability: "integration.event.dispatch" },
        }).catch(() => {});

        res.json({
          success: true,
          message: "Stock received",
          data: { id: req.params.id },
        });
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("Receive purchase error:", error);
        res
          .status(
            error.code === "ALREADY_RECEIVED"
              ? 409
              : error.message === "Purchase not found"
                ? 404
                : 400
          )
          .json({ success: false, message: error.message });
      } finally {
        client.release();
      }
    }
  );

  return router;
}
