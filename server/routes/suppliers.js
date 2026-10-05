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
