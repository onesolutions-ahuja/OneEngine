import express from "express";
import { createGlobalProductLookupService } from "../services/globalProductLookup.js";

export default function createEanLookupRouter({ authenticate, db, lookupService = createGlobalProductLookupService() }) {
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
      const result = await lookupService.lookup({
        db,
        companyId: req.user.companyId,
        reqCompanyId: req.user.companyId,
        barcode: ean,
      });

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
