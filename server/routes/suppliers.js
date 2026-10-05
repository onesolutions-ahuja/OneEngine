import express from "express";

export default function createSuppliersRouter({ authenticate, authorize, db }) {
  const router = express.Router();

  /*
   * GET /api/suppliers
   */
  router.get(
    "/suppliers",
    authenticate,
    authorize("inventory.view"),
    async (req, res) => {
      try {
        const result = await db(
          `
          SELECT
            s.id,
            s.name,
            s.contact_name,
            s.phone,
            s.email,
            s.address,
            s.notes,
            s.active,
            COUNT(p.id)::int AS purchase_count,
            COALESCE(SUM(p.total), 0) AS total_purchase_value,
            s.created_at,
            s.updated_at
          FROM suppliers s
          LEFT JOIN purchases p
            ON p.supplier_id = s.id AND p.company_id = s.company_id
          WHERE s.company_id = $1
          GROUP BY s.id
          ORDER BY s.name
          `,
          [req.user.companyId]
        );

        res.json({ success: true, data: result.rows });
      } catch (error) {
        console.error("Load suppliers error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load suppliers" });
      }
    }
  );

  /*
   * GET /api/suppliers/:id
   */
  router.get(
    "/suppliers/:id",
    authenticate,
    authorize("inventory.view"),
    async (req, res) => {
      try {
        const supplier = await db(
          `
          SELECT
            s.id, s.name, s.contact_name, s.phone, s.email, s.address, s.notes, s.active,
            COUNT(p.id)::int AS purchase_count,
            COALESCE(SUM(p.total), 0) AS total_purchase_value,
            s.created_at, s.updated_at
          FROM suppliers s
          LEFT JOIN purchases p ON p.supplier_id = s.id AND p.company_id = s.company_id
          WHERE s.id = $1 AND s.company_id = $2
          GROUP BY s.id
          `,
          [req.params.id, req.user.companyId]
        );

        if (!supplier.rows.length) {
          return res
            .status(404)
            .json({ success: false, message: "Supplier not found" });
        }

        const purchases = await db(
          `
          SELECT p.id, p.reference_number, p.purchase_date, p.status,
            p.total, s.name AS store_name
          FROM purchases p
          LEFT JOIN stores s ON s.id = p.store_id
          WHERE p.supplier_id = $1 AND p.company_id = $2
          ORDER BY p.purchase_date DESC, p.created_at DESC
          `,
          [req.params.id, req.user.companyId]
        );
        const products = await db(
          `SELECT sp.id, sp.product_id, p.name AS product_name, p.sku, p.barcode,
             sp.supplier_sku, sp.supplier_description, sp.cost_price,
             sp.effective_from, sp.effective_to, sp.preferred, sp.active
             FROM supplier_products sp INNER JOIN products p ON p.id=sp.product_id
            WHERE sp.supplier_id=$1 AND sp.company_id=$2 ORDER BY p.name, sp.effective_from DESC`,
          [req.params.id, req.user.companyId]
        );

        res.json({
          success: true,
          data: { ...supplier.rows[0], purchases: purchases.rows, products: products.rows },
        });
      } catch (error) {
        console.error("Get supplier error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load supplier" });
      }
    }
  );

  router.post("/suppliers/:id/products", authenticate, authorize("inventory.adjust"), async (req, res) => {
    try {
      const cost = Number(req.body?.costPrice);
      if (!req.body?.productId || !Number.isFinite(cost) || cost < 0) {
        return res.status(400).json({ success: false, message: "Product and a valid non-negative cost are required" });
      }
      const result = await db(
        `WITH target_product AS (
           SELECT id FROM products WHERE id=$3 AND company_id=$1 FOR UPDATE
         ), demoted_preferred AS (
           UPDATE supplier_products sp
              SET preferred=false, updated_at=NOW()
             FROM target_product p
            WHERE sp.company_id=$1 AND sp.product_id=p.id
              AND sp.preferred=true AND sp.active=true AND $9::boolean=true
              AND (sp.supplier_id<>$2 OR sp.effective_from IS DISTINCT FROM COALESCE($7::date,CURRENT_DATE))
              AND EXISTS (SELECT 1 FROM suppliers WHERE id=$2 AND company_id=$1)
            RETURNING sp.id
         )
         INSERT INTO supplier_products
          (company_id, supplier_id, product_id, supplier_sku, supplier_description,
           cost_price, effective_from, effective_to, preferred, active)
         SELECT $1,$2,$3,$4,$5,$6,COALESCE($7::date,CURRENT_DATE),$8,$9,$10
          FROM target_product
          WHERE EXISTS (SELECT 1 FROM suppliers WHERE id=$2 AND company_id=$1)
            AND (SELECT COUNT(*) FROM demoted_preferred) >= 0
         ON CONFLICT (company_id, supplier_id, product_id, effective_from)
         DO UPDATE SET supplier_sku=EXCLUDED.supplier_sku,
           supplier_description=EXCLUDED.supplier_description, cost_price=EXCLUDED.cost_price,
           effective_to=EXCLUDED.effective_to, preferred=EXCLUDED.preferred,
           active=EXCLUDED.active, updated_at=NOW()
         RETURNING *`,
        [req.user.companyId, req.params.id, req.body?.productId,
          req.body?.supplierSku || null, req.body?.supplierDescription || null,
          cost, req.body?.effectiveFrom || null,
          req.body?.effectiveTo || null, req.body?.preferred === true, req.body?.active !== false]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Supplier or product not found" });
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Set supplier product error:", error);
      res.status(400).json({ success: false, message: error.message || "Unable to save supplier product" });
    }
  });

  router.get("/products/:productId/suppliers", authenticate, authorize("inventory.view"), async (req, res) => {
    try {
      const result = await db(
        `SELECT sp.id, sp.supplier_id, s.name AS supplier_name, s.active AS supplier_active,
           sp.supplier_sku, sp.supplier_description, sp.cost_price,
           sp.effective_from, sp.effective_to, sp.preferred, sp.active
           FROM supplier_products sp
           INNER JOIN suppliers s ON s.id=sp.supplier_id AND s.company_id=sp.company_id
          WHERE sp.product_id=$1 AND sp.company_id=$2
          ORDER BY sp.preferred DESC, sp.active DESC, sp.cost_price ASC, s.name`,
        [req.params.productId, req.user.companyId]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Load product suppliers error:", error);
      res.status(500).json({ success: false, message: "Unable to load product suppliers" });
    }
  });


  return router;
}
