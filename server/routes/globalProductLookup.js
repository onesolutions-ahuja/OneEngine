import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

// Product-provider configuration is metadata-owned. This route is only a thin
// compatibility transport into the generic Flow runtime; it contains no provider
// catalogue, field mapping, credential persistence, or provider-specific behavior.
export default function createGlobalProductLookupRouter({ authenticate, authorize, db, writeAudit, connectorDrivers = null }) {
  const router = express.Router();

  router.post("/global-products/lookup", authenticate, authorize("global_product.view"), async (req, res) => {
    try {
      const connectionId = String(req.body?.connectionId || "").trim();
      const barcode = String(req.body?.barcode || "").trim();
      if (!connectionId || !barcode) return res.status(400).json({ success:false, code:"FLOW_INPUT_REQUIRED", message:"connectionId and barcode are required" });
      const execution = await executeSystemWorkflow({
        db, companyId:req.user.companyId, userId:req.user.id || null,
        systemKey:"flow:global_product.lookup", req,
        input:{ connectionId, barcode, operation:"product.lookup" },
        storeId:req.user.storeId || null, writeAudit,
        source:{ type:"api", method:req.method, path:req.path, capability:"GLOBAL_PRODUCT_LOOKUP" },
        extraContext:{ connectorDrivers },
      });
      res.json({ success:true, data:execution.result });
    } catch (error) {
      res.status(error?.status || 500).json({ success:false, code:error?.code || "LOOKUP_FAILED", message:error?.status ? error.message : "Unable to execute product lookup Flow" });
    }
  });

  return router;
}
