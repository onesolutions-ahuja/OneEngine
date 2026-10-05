import express from "express";
import { exportProductsCsv, validateCsvImport, previewCsvImport, parseCsv, executeCsvImport } from "../services/productImportExport.js";
import { resolveBatchEntry, normaliseBatchPolicy } from "../services/batchPolicy.js";
import { upsertBatchRow } from "../services/inventory.js";
import { ean13IdentityError } from "../src/utils/barcodeValidation.js";

export default function createProductsRouter({ authenticate, authorize, db: domainDb, pool, createInventoryMovement, writeAudit, canAccessStore, savePlatformRecord = null }) {
  const router = express.Router();
  const db = domainDb;

  /*
   * GET /api/categories
   *
   * Returns active categories when no query parameter is given (used by POS product selector).
   * When ?all=true is passed, returns all categories (including inactive) with product counts
   * (used by the admin Categories management page).
   */
  router.get("/categories", authenticate, authorize("category.view"), async (req, res) => {
    try {
      const includeAll = req.query.all === "true";

      const result = await db(
        `
        SELECT
          c.id,
          c.name,
          c.display_order,
          c.active,
          COUNT(p.id) AS product_count
        FROM categories c
        LEFT JOIN products p
          ON p.category_id = c.id
          AND p.company_id = c.company_id
          AND p.active = true
        WHERE c.company_id = $1
        ${includeAll ? "" : "  AND c.active = true"}
        GROUP BY c.id
        ORDER BY ${includeAll ? "c.active DESC, c.display_order, c.name" : "c.display_order, c.name"}
        `,
        [req.user.companyId]
      );

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Categories error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to load categories",
      });
    }
  });

  /*
   * GET /api/products/most-selling
   *
   * Till "Most Selling" pseudo-category. Ranks products by how FREQUENTLY
   * they appear in sales — COUNT(DISTINCT si.sale_id) — not by total
   * quantity: a product sold 100 units in 1 transaction must rank BELOW a
   * product appearing in 50 separate transactions.
   *
   * Scope: the authenticated company; store-scoped when the caller has a
   * store context (matching the till). Only active products are returned.
   *
   * Time range: ?days=N (default 30, capped at 365). There is no existing
   * best-seller period convention in the app (reports take explicit date
   * ranges), so 30 days is the documented default — a bounded window keeps
   * the aggregate cheap on every till load.
   *
   * Deterministic ordering: frequency DESC, then latest sale recency DESC,
   * then product name ASC (stable tie-breaker).
   */
  router.get("/products/most-selling", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const daysRaw = Number(req.query.days);
      const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), 365) : 30;
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

      const result = await db(
        `
        SELECT
          p.id,
          p.name,
          p.sku,
          p.barcode,
          p.image_url,
          p.price,
          p.category_id,
          c.name AS category_name,
          COUNT(DISTINCT si.sale_id)::int AS sale_frequency,
          MAX(s.created_at) AS last_sold_at
        FROM sale_items si
        INNER JOIN sales s ON s.id = si.sale_id
          AND s.company_id = $1
          AND s.status = 'completed'
          ${req.user.storeId ? "AND s.store_id = $2" : ""}
          AND s.created_at >= NOW() - ($${req.user.storeId ? "3" : "2"}::text || ' days')::interval
        INNER JOIN products p ON p.id = si.product_id
          AND p.company_id = $1
          AND p.active = true
          AND p.sku IS DISTINCT FROM 'MISC' /* Misc Item lines are not a product ranking. IS DISTINCT FROM is NULL-safe: a plain "sku <> 'MISC'" comparison evaluates to NULL for SKU-less rows and silently drops them from the ranking. */
        LEFT JOIN categories c ON c.id = p.category_id
        GROUP BY p.id, c.name
        ORDER BY
          sale_frequency DESC,
          last_sold_at DESC NULLS LAST,
          p.name ASC
        LIMIT $${req.user.storeId ? "4" : "3"}
        `,
        req.user.storeId
          ? [req.user.companyId, req.user.storeId, String(days), limit]
          : [req.user.companyId, String(days), limit]
      );

      res.json({ success: true, data: result.rows, days });
    } catch (error) {
      console.error("Most-selling error:", error);
      res.status(500).json({ success: false, message: "Unable to load most-selling products" });
    }
  });

  /*
   * POST /api/categories
   */
  router.get("/products", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const result = await db(
        `
        SELECT
          p.id,
          p.name,
          p.sku,
          p.barcode,
          p.description,
          p.price,
          p.cost_price,
          p.vat_rate,
          p.vat_applicable,
          p.age_restricted,
          p.image_url,
          p.stock_quantity,
          p.low_stock_level,
          p.track_stock,
          p.batch_tracking,
          p.category_id,
          p.parent_product_id,
          p.product_kind,
          p.variant_attributes,
          p.active,
          c.name AS category_name,
          p.created_at,
          p.updated_at
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE p.company_id = $1
          AND p.active = true
        ORDER BY p.name
        `,
        [req.user.companyId]
      );

      res.json({
        success: true,
        data: result.rows,
      });

    } catch (error) {
      console.error("Load products error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to load products",
      });
    }
  });

  /*
   * GET /api/products/catalogue
   *
   * Generic till/offline product snapshot. Business availability and
   * contextual pricing policy are Flow-owned, not route-owned.
   */
  router.get("/products/catalogue", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const storeId = req.user.storeId || null;
      const result = await db(
        `SELECT p.id,p.name,p.sku,p.barcode,p.price,p.vat_rate,p.vat_applicable,
                p.age_restricted,p.image_url,p.low_stock_level,p.track_stock,
                p.category_id,p.active,c.name AS category_name,
                COALESCE(ps.quantity,p.stock_quantity) AS stock,p.updated_at AS catalogue_updated_at
           FROM products p
           LEFT JOIN categories c ON c.id=p.category_id AND c.company_id=p.company_id
           LEFT JOIN product_store_stock ps ON ps.product_id=p.id AND ps.company_id=p.company_id AND ps.store_id=$2
          WHERE p.company_id=$1 AND p.active=TRUE AND p.sku IS DISTINCT FROM 'MISC'
          ORDER BY p.name`,
        [companyId, storeId]
      );
      const categories = await db(
        `SELECT DISTINCT c.id,c.name,c.display_order,c.active,c.created_at
           FROM categories c JOIN products p ON p.category_id=c.id AND p.company_id=c.company_id
          WHERE c.company_id=$1 AND p.active=TRUE AND p.sku IS DISTINCT FROM 'MISC'
          ORDER BY c.display_order,c.name`,
        [companyId]
      );
      const versionResult = await db(
        `SELECT GREATEST(
           COALESCE((SELECT MAX(updated_at) FROM products WHERE company_id=$1),'epoch'::timestamptz),
           COALESCE((SELECT MAX(created_at) FROM categories WHERE company_id=$1),'epoch'::timestamptz),
           COALESCE((SELECT MAX(updated_at) FROM product_store_stock WHERE company_id=$1 AND store_id=$2),'epoch'::timestamptz)
         ) AS version`,
        [companyId, storeId]
      );
      res.json({ success:true, data:{ version:versionResult.rows[0]?.version || null, full:true, products:result.rows, categories:categories.rows } });
    } catch (error) {
      console.error("Catalogue load error:", error);
      res.status(500).json({ success:false, message:"Unable to load POS catalogue" });
    }
  });

  /*
   * GET /api/products/export
   *
   * Exports products as CSV. Supports an optional ?storeId= filter
   * to export only products associated with a specific store.
   * Store-scoped users can only export their own store; admins can
   * export all stores within the company.
   */
  router.get("/products/export", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const { storeId } = req.query;

      if (storeId) {
        const allowed =
          req.user.storeId === storeId ||
          (await canAccessStore(req.user, storeId));
        if (!allowed) {
          return res.status(403).json({
            success: false,
            message: "You do not have access to this store",
          });
        }
      }

      if (!pool) {
        return res.status(500).json({
          success: false,
          message: "DATABASE_URL is not configured",
        });
      }

      const client = await pool.connect();
      let transactionStarted = false;

      try {
        await client.query("BEGIN");
        transactionStarted = true;

        const rows = await exportProductsCsv(client, req.user.companyId, storeId || null);

        const headers = [
          "product_id", "sku", "ean", "name", "description", "category",
          "vat_rate", "cost_price", "price", "active",
          "store_id", "store_code", "store_enabled", "store_price",
          "reorder_level", "minimum_stock",
        ];

        const csvRows = [headers.join(",")];
        for (const row of rows) {
          const values = headers.map((h) => {
            const v = row[h] ?? "";
            const str = String(v ?? "");
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
              return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
          });
          csvRows.push(values.join(","));
        }

        await client.query("COMMIT");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="products-export-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(csvRows.join("\n"));
      } catch (error) {
        if (transactionStarted) {
          await client.query("ROLLBACK");
        }
        console.error("Product export error:", error);
        res.status(500).json({
          success: false,
          message: "Unable to export products",
        });
      } finally {
        if (typeof client.release === "function") {
          client.release();
        }
      }
    } catch (error) {
      console.error("Product export error:", error);
      res.status(500).json({
        success: false,
        message: "Unable to export products",
      });
    }
  });

  /*
   * POST /api/products/import/validate
   *
   * Validates a CSV payload without writing to the database.
   * Returns row-by-row validation errors and a preview of changes.
   */
  router.get("/products/:id/kiosk-metadata", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const result = await db(
        "SELECT kiosk_metadata FROM products WHERE id=$1 AND company_id=$2 AND active=TRUE LIMIT 1",
        [req.params.id, req.user.companyId]
      );
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Product not found" });
      res.json({ success: true, data: result.rows[0].kiosk_metadata || {} });
    } catch (error) {
      console.error("Load product kiosk metadata error:", error);
      res.status(500).json({ success: false, message: "Unable to load OneKiosk product data" });
    }
  });



  /*
   * GET /api/products/:id
   */
  router.get("/products/:id", authenticate, authorize("product.view"), async (req, res) => {
    try {
      const result = await db(
        `
        SELECT
          p.id,
          p.name,
          p.sku,
          p.barcode,
          p.description,
          p.price,
          p.cost_price,
          p.vat_rate,
          p.image_url,
          p.stock_quantity,
          p.low_stock_level,
          p.track_stock,
          p.category_id,
          p.parent_product_id,
          p.product_kind,
          p.variant_attributes,
          p.active,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE p.id = $1
          AND p.company_id = $2
        `,
        [req.params.id, req.user.companyId]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Get product error:", error);

      res.status(500).json({
        success: false,
        message: "Unable to load product",
      });
    }
  });

  /*
   * POST /api/products
   */
  router.get("/products/:id/history", authenticate, authorize("product.view"), async (req, res) => {
    try {
      // Verify product belongs to user's company
      const productCheck = await db(
        `
        SELECT id, name
        FROM products
        WHERE id = $1 AND company_id = $2
        `,
        [req.params.id, req.user.companyId]
      );

      if (!productCheck.rows.length) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const result = await db(
        `
        SELECT
          al.id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.details,
          al.created_at,
          u.username,
          u.full_name
        FROM audit_logs al
        LEFT JOIN users u
          ON u.id = al.user_id
        WHERE al.company_id = $1
          AND al.entity_type = 'product'
          AND al.entity_id = $2
        ORDER BY al.created_at DESC
        LIMIT 100
        `,
        [req.user.companyId, req.params.id]
      );

      res.json({
        success: true,
        data: result.rows,
        productName: productCheck.rows[0].name,
      });
    } catch (error) {
      console.error("Product history error:", error);
      res.status(500).json({
        success: false,
        message: "Unable to load product history",
        error: error.message,
      });
    }
  });

  return router;
}
