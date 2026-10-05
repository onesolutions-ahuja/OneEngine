import express from "express";
import { normaliseVariantAttributes, validateBundleComponents } from "../services/productFeatures.js";

export default function createProductFeaturesRouter({ authenticate, authorize, db, pool }) {
  const router = express.Router();
  const productScope = (id, companyId) => db(
    "SELECT id, name, price, vat_rate, vat_applicable, track_stock, active FROM products WHERE id=$1 AND company_id=$2 AND active=true",
    [id, companyId]
  );

  router.get("/products/:id/variants", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const result = await db(
        `SELECT id, parent_product_id, name, sku, barcode, price, vat_rate, vat_applicable,
                stock_quantity, track_stock, variant_attributes
           FROM products
          WHERE company_id=$1 AND (id=$2 OR parent_product_id=$2) AND active=true
          ORDER BY id`,
        [req.user.companyId, req.params.id]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load product variants error:", error);
      res.status(500).json({ success: false, message: "Unable to load product variants" });
    }
  });

  router.get("/products/:id/modifiers", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const result = await db(
        `SELECT g.id AS group_id, g.name AS group_name, g.required, g.max_selections,
                o.id, o.name, o.price, o.track_stock, o.inventory_product_id
           FROM product_modifier_groups g
           LEFT JOIN product_modifier_options o ON o.group_id=g.id
          WHERE g.company_id=$1 AND g.product_id=$2 AND g.active=true
          ORDER BY g.display_order, o.display_order, o.name`,
        [req.user.companyId, req.params.id]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load product modifiers error:", error);
      res.status(500).json({ success: false, message: "Unable to load product modifiers" });
    }
  });

  
  return router;
}
