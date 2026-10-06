import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

export default function createEanLookupRouter({ authenticate, db }) {
  const router = express.Router();

  // Shared reference lookup only: never reads or writes customer products.
  router.get("/ean-lookup/:ean", authenticate, async (req, res) => {
    const ean = String(req.params.ean || "").trim();
    if (!/^([0-9]{8}|[0-9]{12,14})$/.test(ean)) {
      return res.status(400).json({
        success: false,
        message: "EAN must contain 8, 12, 13 or 14 digits",
      });
    }

    try {
      const connection = await db(
        `SELECT id FROM integration_connections
          WHERE company_id=$1 AND enabled=TRUE
            AND integration_type='product_lookup'
          ORDER BY fallback_order ASC, updated_at DESC LIMIT 1`,
        [req.user.companyId]
      );
      if (!connection.rows[0]?.id) {
        return res.status(503).json({ success:false, code:"NO_PROVIDER", data:null, message:"No Global Product Lookup provider installed" });
      }
      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id || null,
        systemKey: "flow:global_product.lookup",
        req,
        input: { connectionId: connection.rows[0].id, barcode: ean, operation: "product.lookup" },
        storeId: req.user.storeId || null,
        source: { type:"api", method:req.method, path:req.path, capability:"GLOBAL_PRODUCT_LOOKUP" },
      });
      const flowResult = execution.result || {};
      const product = flowResult.product || flowResult.providerResult?.data || null;
      const result = product ? { status:"found", product } : { status:"not_found", product:null };

      // Record valid attempts using the existing authenticated session context.
      await db(
        `INSERT INTO ean_lookup_usage (user_id, company_id, store_id, ean, lookup_result)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, req.user.companyId, req.user.storeId || null, ean,
          result.status === "found" ? "FOUND" : result.status === "unavailable" ? "ERROR" : "NOT_FOUND"]
      );

      if (result.status === "no_provider") {
        return res.status(503).json({
          success: false,
          code: "NO_PROVIDER",
          data: null,
          message: "No Global Product Lookup provider installed",
        });
      }

      if (result.status !== "found") {
        return res.status(404).json({
          success: false,
          data: null,
          message: result.status === "unavailable" ? "Product lookup providers are temporarily unavailable" : "Barcode not found by configured providers",
        });
      }

      res.json({ success: true, data: result.product });
    } catch (error) {
      console.error("EAN lookup error:", error);
      res.status(500).json({
        success: false,
        message: "Unable to look up EAN",
      });
    }
  });

  return router;
}
