import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

export default function createPurchasesRouter({ authenticate, authorize, db, pool }) {
  const router = express.Router();

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

  return router;
}
