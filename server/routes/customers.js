import express from "express";

export default function createCustomersRouter({
  authenticate,
  authorize,
  db: domainDb,
  pool,
  savePlatformRecord = null,
  canViewCompanyCustomers,
  associateCustomerWithStore,
  requireLoyaltyEntitlement = (_req, _res, next) => next(),
  /*
   * Administrative customer access is permission-driven. Keep action authority
   * separate from canViewCompanyCustomers, which controls DATA SCOPE
   * (company-wide vs store-restricted reads), so changing an action permission
   * cannot silently widen customer visibility.
   */
  hasCompanyAdminAccess = async (req) => canViewCompanyCustomers(req.user),
}) {
  const router = express.Router();

  const db = domainDb;

  const parseCsv = (csv) => {
    const lines = String(csv || "").split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = lines.shift().split(",").map((header) => header.trim());
    return lines.map((line) => {
      const values = line.split(",");
      return headers.reduce((row, header, index) => ({ ...row, [header]: (values[index] || "").trim() }), {});
    });
  };

  /*
   * GET /api/customers
   */
  router.get("/customers", authenticate, authorize("customer.view"), async (req, res) => {
    try {
      const companyScope =
        req.query.scope === "company" && (await canViewCompanyCustomers(req.user));
      const params = [req.user.companyId];
      const filters = ["c.company_id = $1"];

      if (!companyScope) {
        params.push(req.user.storeId);
        filters.push(`cs.store_id = $${params.length}`);
        filters.push("cs.active = true");
      }

      if (req.query.active !== undefined) {
        params.push(req.query.active !== "false");
        filters.push(`c.active = $${params.length}`);
      }

      if (req.query.search) {
        params.push(`%${String(req.query.search).trim()}%`);
        filters.push(
          `(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length})`
        );
      }

      const result = await db(
        `
        SELECT c.id, c.company_id, c.name, c.phone, c.email, c.address, c.postcode,
          c.loyalty_number, c.notes, c.active, c.created_at, c.updated_at,
          MAX(cs.last_purchase_at) AS last_purchase_at,
          STRING_AGG(DISTINCT st.name, ', ' ORDER BY st.name) AS store_names
        FROM customers c
        ${
          companyScope
            ? "LEFT JOIN customer_stores cs ON cs.customer_id = c.id"
            : "INNER JOIN customer_stores cs ON cs.customer_id = c.id"
        }
        LEFT JOIN stores st ON st.id = cs.store_id
        WHERE ${filters.join(" AND ")}
        GROUP BY c.id
        ORDER BY c.name
        `,
        params
      );

      res.json({
        success: true,
        data: result.rows,
        scope: companyScope ? "company" : "store",
      });
    } catch (error) {
      console.error("Load customers error:", error);
      res
        .status(500)
        .json({ success: false, message: "Unable to load customers" });
    }
  });

  /*
   * GET /api/customer-lookup
   */
  router.get("/customer-lookup", authenticate, authorize("customer.view"), async (req, res) => {
    const query = String(req.query.search || "").trim();
    if (!query) return res.json({ success: true, data: [] });

    try {
      const result = await db(
        `
        SELECT c.id, c.name, c.phone, c.email, c.active,
          EXISTS (
            SELECT 1 FROM customer_stores cs
            WHERE cs.customer_id = c.id AND cs.store_id = $2 AND cs.active = true
          ) AS associated
        FROM customers c
        WHERE c.company_id = $1
          AND c.active = true
          AND (c.name ILIKE $3 OR c.phone ILIKE $3 OR c.email ILIKE $3)
        ORDER BY c.name
        LIMIT 25
        `,
        [req.user.companyId, req.user.storeId, `%${query}%`]
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("Customer lookup error:", error);
      res
        .status(500)
        .json({ success: false, message: "Unable to search customers" });
    }
  });

  /*
   * GET /api/customers/:id
   */
  router.get("/customers/:id", authenticate, authorize("customer.view"), async (req, res) => {
    try {
      const companyAdmin = await canViewCompanyCustomers(req.user);
      const result = await db(
        `
        SELECT c.id, c.company_id, c.name, c.phone, c.email, c.address, c.postcode,
          c.loyalty_number, c.notes, c.active, c.created_at, c.updated_at,
          COALESCE(json_agg(json_build_object(
            'storeId', cs.store_id,
            'storeName', st.name,
            'active', cs.active,
            'lastPurchaseAt', cs.last_purchase_at
          ) ORDER BY cs.store_id) FILTER (WHERE cs.id IS NOT NULL), '[]') AS stores
        FROM customers c
        LEFT JOIN customer_stores cs ON cs.customer_id = c.id
        LEFT JOIN stores st ON st.id = cs.store_id
        WHERE c.id = $1 AND c.company_id = $2
        GROUP BY c.id
        `,
        [req.params.id, req.user.companyId]
      );
      if (!result.rows.length)
        return res
          .status(404)
          .json({ success: false, message: "Customer not found" });

      if (!companyAdmin) {
        const visible = await db(
          `SELECT 1 FROM customer_stores WHERE customer_id = $1 AND store_id = $2 AND active = true`,
          [req.params.id, req.user.storeId]
        );
        if (!visible.rows.length)
          return res
            .status(404)
            .json({ success: false, message: "Customer not found" });
      }
      const sales = await db(
        `
        SELECT s.id, s.receipt_number, s.store_id, st.name AS store_name,
          s.total, s.status, s.created_at,
          COALESCE(
            (SELECT p.payment_method
             FROM payments p
             WHERE p.sale_id = s.id AND p.status = 'completed'
             ORDER BY p.created_at DESC
             LIMIT 1),
            NULL
          ) AS payment_method
        FROM sales s
        LEFT JOIN stores st ON st.id = s.store_id
        WHERE s.customer_id = $1
          AND s.company_id = $2
          AND NOT (s.offline_created = true AND s.sync_status <> 'synced')
        ORDER BY s.created_at DESC
        LIMIT 100
        `,
        [req.params.id, req.user.companyId]
      );


      res.json({
        success: true,
        data: { ...result.rows[0], sales: sales.rows },
      });
    } catch (error) {
      console.error("Get customer error:", error);
      res
        .status(500)
        .json({ success: false, message: "Unable to load customer" });
    }
  });





  
  return router;
}
