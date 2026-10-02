import express from "express";
import { valuationRow } from "../services/inventoryValuation.js";
import { buildPlatformObjectQuery, STANDARD_REPORT_SOURCES, validatePlatformReportDefinition } from "../services/reportableSources.js";
import { loadPlatformReportContext } from "../services/platformReportSecurity.js";
import { compileFilterLogic, normalizeAdvancedReportDefinition, reportCapabilities } from "../services/reportAnalyticsDefinition.js";
import { executeAnalyticsDefinition } from "../services/reportExecution.js";
import { normalizeFolder, normalizeSubscription, subscriptionConditionMatches, subscriptionIsDue } from "../services/analyticsManagement.js";
import { normalizeReportType } from "../services/reportTypeDefinition.js";
import { normalizeHistoricalTrend, normalizePreviewPreference, normalizeReportExport, normalizeReportTypeExperience } from "../services/reportExperience.js";
import { buildDetailsCsv, buildFormattedXlsx } from "../services/reportExport.js";
import { resolveAnalyticsPrincipalAccess } from "../services/analyticsSecurity.js";
import { publishPlatformEvent } from "../services/platformEvents.js";

export const CUSTOM_REPORT_FIELDS = [
  { key: "date", label: "Date", sql: "(s.created_at AT TIME ZONE c.timezone)::date", groupable: true },
  { key: "store", label: "Store", sql: "st.name", groupable: true },
  { key: "user", label: "Operator", sql: "COALESCE(u.full_name, u.username, 'Unknown')", groupable: true },
  { key: "product", label: "Product", sql: "p.name", groupable: true },
  { key: "category", label: "Category", sql: "COALESCE(pc.name, 'Uncategorised')", groupable: true },
  { key: "method", label: "Payment method", sql: "COALESCE(pay.payment_method, 'Unknown')", groupable: true },
  { key: "sku", label: "SKU", sql: "p.sku", groupable: true },
  { key: "quantity", label: "Quantity sold", sql: "COALESCE(SUM(si.quantity), 0)", aggregate: true },
  { key: "gross_sales", label: "Gross sales", sql: "COALESCE(SUM(si.total), 0)", aggregate: true },
  { key: "net_sales", label: "Net sales", sql: "COALESCE(SUM(si.total - si.tax), 0)", aggregate: true },
  { key: "total", label: "Total", sql: "COALESCE(SUM(pay.amount), 0)", aggregate: true },
  { key: "vat", label: "VAT", sql: "COALESCE(SUM(si.tax), 0)", aggregate: true },
  { key: "discount", label: "Discounts", sql: "COALESCE(SUM(si.discount), 0)", aggregate: true },
  { key: "transactions", label: "Transactions", sql: "COUNT(DISTINCT s.id)", aggregate: true },
];
const CUSTOM_FIELD_MAP = new Map(CUSTOM_REPORT_FIELDS.map((field) => [field.key, field]));
const CUSTOM_DATE_FILTERS = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" }, { key: "last_7_days", label: "Last 7 days" },
  { key: "this_month", label: "This month" }, { key: "this_quarter", label: "This quarter" },
  { key: "fiscal_year", label: "Fiscal year" }, { key: "custom", label: "Custom dates" },
];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUuidList(values, label) {
  const normalized = [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )];
  if (normalized.some((value) => !UUID_RE.test(value))) {
    throw new Error(`Invalid ${label} identifier`);
  }
  return normalized;
}

function customDateRange(filters = []) {
  const dateFilter = filters.find((filter) => filter && filter.field === "date");
  const operator = dateFilter?.operator || "this_week";
  const now = new Date();
  const iso = (date) => date.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (operator === "custom") return { from: dateFilter.from || dateFilter.dateFrom || null, to: dateFilter.to || dateFilter.dateTo || null };
  if (operator === "today") return { from: iso(start), to: iso(start) };
  if (operator === "yesterday") { start.setUTCDate(start.getUTCDate() - 1); return { from: iso(start), to: iso(start) }; }
  if (operator === "last_7_days") { start.setUTCDate(start.getUTCDate() - 6); return { from: iso(start), to: iso(new Date()) }; }
  if (operator === "this_month") return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: iso(new Date()) };
  if (operator === "this_quarter") {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1))), to: iso(new Date()) };
  }
  if (operator === "fiscal_year") return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: iso(new Date()) };
  const day = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - day + 1);
  return { from: iso(start), to: iso(new Date()) };
}

export function validateCustomReportDefinition(input = {}) {
  const source = input || {};
  if (source.dataSource && !["sales", "platform_object"].includes(source.dataSource)) throw new Error("Unsupported report data source");
  const advanced = normalizeAdvancedReportDefinition(source);
  if (source.dataSource === "platform_object") {
    return { ...advanced, dataSource: "platform_object", objectId: String(source.objectId || ""), reportTypeId: source.reportTypeId || source.report_type_id || null };
  }
  const fields = advanced.fields;
  if (!fields.length || fields.some((field) => !CUSTOM_FIELD_MAP.has(field))) throw new Error("Select at least one valid report field");
  const rowGroups = advanced.rowGroups;
  const columnGroups = advanced.columnGroups;
  for (const field of [...rowGroups, ...columnGroups]) {
    if (!CUSTOM_FIELD_MAP.has(field) || !CUSTOM_FIELD_MAP.get(field).groupable) throw new Error("Invalid grouping field");
    if (!fields.includes(field)) throw new Error("Grouped fields must be selected");
  }
  if (advanced.sort.some((item) => !item || !CUSTOM_FIELD_MAP.has(String(item.field)) || !fields.includes(String(item.field)))) throw new Error("Invalid sort field");
  for (const filter of advanced.filters) {
    if (!filter || (filter.field && !["date", "store", "user", "product"].includes(String(filter.field)))) throw new Error("Invalid report filter");
    if (filter.field === "date" && filter.operator && !CUSTOM_DATE_FILTERS.some((item) => item.key === filter.operator) && filter.operator !== "relative_date") throw new Error("Invalid date filter");
    if (filter.field && filter.field !== "date" && !["equals", "in"].includes(filter.operator)) throw new Error("Invalid report filter operator");
  }
  return {
    ...advanced,
    dataSource: "sales",
    groupBy: rowGroups,
    storeIds: validateUuidList(source.storeIds, "store"),
    userIds: validateUuidList(source.userIds, "user"),
  };
}

export function buildCustomSalesQuery(definition, dateRange, storeIds, userIds) {
  const params = [dateRange.from || null, dateRange.to || null];
  const where = [
    "s.company_id = $3", "s.status = 'completed'",
    "($1::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date >= $1::date)",
    "($2::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date <= $2::date)",
  ];
  params.push(null); // company id is supplied by the caller after query construction
  let next = 4;
  if (storeIds.length) { where.push(`s.store_id = ANY($${next}::uuid[])`); params.push(storeIds); next += 1; }
  if (userIds.length) { where.push(`s.user_id = ANY($${next}::uuid[])`); params.push(userIds); next += 1; }
  const filterClauses = [];
  for (const filter of definition.filters) {
    if (!filter || filter.field === "date" || !["store", "user", "product"].includes(filter.field)) continue;
    const values = (Array.isArray(filter.value) ? filter.value : [filter.value]).filter(Boolean).map(String);
    if (!values.length) continue;
    const column = filter.field === "store" ? "s.store_id" : filter.field === "user" ? "s.user_id" : "si.product_id";
    filterClauses.push(`${column} ${filter.operator === "in" ? `= ANY($${next}::uuid[])` : `= $${next}`}`);
    params.push(filter.operator === "in" ? values : values[0]); next += 1;
  }
  if (filterClauses.length) {
    const mode = String(definition.filterLogic || "all").toLowerCase();
    const logic = mode === "all" || mode === "any"
      ? filterClauses.join(mode === "any" ? " OR " : " AND ")
      : compileFilterLogic(definition.filterLogic, filterClauses);
    where.push(`(${logic})`);
  }
  const fields = definition.fields.map((key) => CUSTOM_FIELD_MAP.get(key));
  const needsPayments = definition.fields.includes("method") || definition.fields.includes("total");
  const select = fields.map((field) => `${field.sql} AS "${field.key}"`);
  const explicitGroups = [...new Set([...(definition.rowGroups || definition.groupBy || []), ...(definition.columnGroups || [])])].map((key) => CUSTOM_FIELD_MAP.get(key).sql);
  const groupByExprs = new Set(explicitGroups);
  for (const field of fields) {
    if (field.groupable && !field.aggregate && !groupByExprs.has(field.sql)) {
      groupByExprs.add(field.sql);
    }
  }
  const groups = [...groupByExprs];
  const order = (definition.sort.length ? definition.sort : [{ field: (definition.rowGroups || definition.groupBy || [])[0] || definition.fields[0], direction: "desc" }])
    .map((item) => `"${item.field}" ${item.direction === "asc" ? "ASC" : "DESC"}`).join(", ");
  const sql = `SELECT ${select.join(", ")} FROM sales s
    INNER JOIN companies c ON c.id=s.company_id
    INNER JOIN sale_items si ON si.sale_id=s.id
    INNER JOIN products p ON p.id=si.product_id
    LEFT JOIN categories pc ON pc.id=p.category_id
    ${needsPayments ? "LEFT JOIN payments pay ON pay.sale_id=s.id AND pay.status='completed'" : ""}
    LEFT JOIN users u ON u.id=s.user_id
    INNER JOIN stores st ON st.id=s.store_id
    WHERE ${where.join(" AND ")}
    ${groups.length ? `GROUP BY ${groups.join(", ")}` : ""}
    ORDER BY ${order} LIMIT ${Math.min(Math.max(Number(definition.rowLimit || 1000),1),1000)}`;
  return { sql, params };
}

function customReportVisibility(user, report) {
  return String(report.created_by) === String(user.id) || report.mapped === true;
}

export default function createReportsRouter({ authenticate, authorize, db }) {
  const { canAccessStore, canViewCompanyCustomers, hasPermission: hasSystemPermission } = arguments[0];
  const router = express.Router();

  function scopedReportParams(req) {
    return [req.user.companyId, req.user.storeId, req.query.dateFrom || null, req.query.dateTo || null];
  }

  async function platformReportContext(req, objectId) {
    return loadPlatformReportContext(db, req, objectId);
  }

  router.get("/reports/summary", authenticate, authorize("reports.summary.view"), async (req, res) => {
    try {
      const result = await db(
        `
        WITH sales_total AS (
          SELECT COALESCE(SUM(s.total),0) gross_sales, COUNT(*)::int transactions,
            COALESCE(SUM(s.tax),0) vat, COALESCE(SUM(s.discount),0) discounts
          FROM sales s INNER JOIN companies c ON c.id=s.company_id
          WHERE s.company_id=$1 AND s.store_id=$2 AND s.status='completed'
            AND ($3::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date >= $3::date)
            AND ($4::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date <= $4::date)
        ), returns_total AS (
          SELECT COALESCE(SUM(sri.quantity * si.unit_price),0) returned_value
          FROM stock_returns sr
          INNER JOIN stock_return_items sri ON sri.return_id=sr.id
          INNER JOIN sale_items si ON si.id=sri.sale_item_id
          INNER JOIN companies c ON c.id=sr.company_id
          WHERE sr.company_id=$1 AND sr.store_id=$2 AND sr.return_type='CUSTOMER'
            AND ($3::date IS NULL OR (sr.created_at AT TIME ZONE c.timezone)::date >= $3::date)
            AND ($4::date IS NULL OR (sr.created_at AT TIME ZONE c.timezone)::date <= $4::date)
        ) SELECT sales_total.*, returns_total.returned_value FROM sales_total, returns_total
        `,
        scopedReportParams(req)
      );
      const row = result.rows[0];
      const gross = Number(row.gross_sales);
      const returned = Number(row.returned_value);
      res.json({ success: true, data: { grossSales: gross, transactions: Number(row.transactions), averageTransaction: Number(row.transactions) ? gross / Number(row.transactions) : 0, vat: Number(row.vat), discounts: Number(row.discounts), returns: returned, netSales: gross - returned } });
    } catch (error) { console.error("Reports summary error:", error); res.status(500).json({ success: false, message: "Unable to load report summary" }); }
  });

  router.get("/reports/sales", authenticate, authorize("reports.sales.view"), async (req, res) => {
    try {
      const result = await db(
        `
        WITH dates AS (SELECT generate_series(COALESCE($3::date, CURRENT_DATE), COALESCE($4::date, CURRENT_DATE), '1 day')::date AS report_date),
        daily AS (SELECT (s.created_at AT TIME ZONE c.timezone)::date report_date, COUNT(*)::int transactions, COALESCE(SUM(s.total),0) gross_sales, COALESCE(SUM(s.tax),0) vat FROM sales s INNER JOIN companies c ON c.id=s.company_id WHERE s.company_id=$1 AND s.store_id=$2 AND s.status='completed' GROUP BY 1),
        returned AS (SELECT (sr.created_at AT TIME ZONE c.timezone)::date report_date, COALESCE(SUM(sri.quantity * si.unit_price),0) returns FROM stock_returns sr INNER JOIN stock_return_items sri ON sri.return_id=sr.id INNER JOIN sale_items si ON si.id=sri.sale_item_id INNER JOIN companies c ON c.id=sr.company_id WHERE sr.company_id=$1 AND sr.store_id=$2 AND sr.return_type='CUSTOMER' GROUP BY 1)
        SELECT dates.report_date AS date, COALESCE(daily.transactions,0) transactions, COALESCE(daily.gross_sales,0) gross_sales, COALESCE(returned.returns,0) returns, COALESCE(daily.gross_sales,0)-COALESCE(returned.returns,0) net_sales, COALESCE(daily.vat,0) vat FROM dates LEFT JOIN daily USING(report_date) LEFT JOIN returned USING(report_date) ORDER BY dates.report_date
        `,
        scopedReportParams(req)
      );
      res.json({ success: true, data: result.rows.map((row) => ({ date: row.date, transactions: Number(row.transactions), grossSales: Number(row.gross_sales), returns: Number(row.returns), netSales: Number(row.net_sales), vat: Number(row.vat) })) });
    } catch (error) { console.error("Sales report error:", error); res.status(500).json({ success: false, message: "Unable to load sales report" }); }
  });

  router.get("/reports/products", authenticate, authorize("reports.products.view"), async (req, res) => {
    try {
      const result = await db(
        `
        SELECT p.id, p.name, p.sku, COALESCE(SUM(si.quantity) FILTER (WHERE s.id IS NOT NULL),0) quantity_sold, COALESCE(SUM(si.total) FILTER (WHERE s.id IS NOT NULL),0) gross_sales,
          COALESCE((SELECT SUM(sri.quantity) FROM stock_return_items sri INNER JOIN stock_returns sr ON sr.id=sri.return_id WHERE sr.return_type='CUSTOMER' AND sri.product_id=p.id AND sr.company_id=$1 AND sr.store_id=$2),0) returned_quantity,
          COALESCE((SELECT SUM(sri.quantity * si2.unit_price) FROM stock_return_items sri INNER JOIN stock_returns sr ON sr.id=sri.return_id INNER JOIN sale_items si2 ON si2.id=sri.sale_item_id WHERE sr.return_type='CUSTOMER' AND sri.product_id=p.id AND sr.company_id=$1 AND sr.store_id=$2),0) returned_sales
        FROM products p LEFT JOIN sale_items si ON si.product_id=p.id LEFT JOIN sales s ON s.id=si.sale_id AND s.company_id=$1 AND s.store_id=$2 AND s.status='completed' AND ($3::date IS NULL OR (s.created_at AT TIME ZONE (SELECT timezone FROM companies WHERE id=$1))::date >= $3::date) AND ($4::date IS NULL OR (s.created_at AT TIME ZONE (SELECT timezone FROM companies WHERE id=$1))::date <= $4::date)
        WHERE p.company_id=$1 GROUP BY p.id ORDER BY quantity_sold DESC LIMIT 100
        `,
        [req.user.companyId, req.user.storeId, req.query.dateFrom || null, req.query.dateTo || null]
      );
      res.json({ success: true, data: result.rows.map((row) => ({ product: row.name, sku: row.sku, quantitySold: Number(row.quantity_sold), grossSales: Number(row.gross_sales), returns: Number(row.returned_quantity), netQuantity: Number(row.quantity_sold) - Number(row.returned_quantity), netSales: Number(row.gross_sales) - Number(row.returned_sales) })) });
    } catch (error) { console.error("Product report error:", error); res.status(500).json({ success: false, message: "Unable to load product report" }); }
  });

  router.get("/reports/payments", authenticate, authorize("reports.payments.view"), async (req, res) => {
    try {
      const result = await db("SELECT pay.payment_method, COALESCE(SUM(pay.amount),0) total, COUNT(*)::int transactions FROM payments pay INNER JOIN sales s ON s.id=pay.sale_id INNER JOIN companies c ON c.id=s.company_id WHERE s.company_id=$1 AND s.store_id=$2 AND s.status='completed' AND ($3::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date >= $3::date) AND ($4::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date <= $4::date) GROUP BY pay.payment_method ORDER BY pay.payment_method", [req.user.companyId, req.user.storeId, req.query.dateFrom || null, req.query.dateTo || null]);
      res.json({ success: true, data: result.rows.map((row) => ({ method: row.payment_method, total: Number(row.total), transactions: row.transactions })) });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load payment report" }); }
  });

  router.get("/reports/customers", authenticate, authorize("reports.customers.view"), async (req, res) => {
    try {
      const result = await db("SELECT COALESCE(c.name,'Walk-in Customer') customer, COUNT(s.id)::int transactions, COALESCE(SUM(s.total),0) spend FROM sales s LEFT JOIN customers c ON c.id=s.customer_id INNER JOIN companies co ON co.id=s.company_id WHERE s.company_id=$1 AND s.store_id=$2 AND s.status='completed' AND ($3::date IS NULL OR (s.created_at AT TIME ZONE co.timezone)::date >= $3::date) AND ($4::date IS NULL OR (s.created_at AT TIME ZONE co.timezone)::date <= $4::date) GROUP BY c.id,c.name ORDER BY spend DESC LIMIT 100", [req.user.companyId, req.user.storeId, req.query.dateFrom || null, req.query.dateTo || null]);
      res.json({ success: true, data: result.rows.map((row) => ({ customer: row.customer, transactions: row.transactions, spend: Number(row.spend), returns: 0, netSpend: Number(row.spend) })) });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load customer report" }); }
  });


  /*
   * GET /reports/inventory-overview
   * Current stock snapshot for the authenticated store. Quantity comes from
   * product_store_stock, while cost comes from the product master.
   */
  router.get("/reports/inventory-overview", authenticate, authorize("reports.inventory.view"), async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(10000, Number(req.query.limit) || 1000));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const result = await db(
        `
        SELECT
          p.name AS product,
          p.sku,
          p.barcode AS ean,
          COALESCE(cat.name, '-') AS category,
          COALESCE(pss.quantity, 0) AS stock_quantity,
          p.cost_price,
          (p.track_stock = true AND p.low_stock_level IS NOT NULL AND COALESCE(pss.quantity, 0) <= p.low_stock_level) AS low_stock,
          s.name AS store_name
        FROM products p
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN product_store_stock pss
          ON pss.product_id = p.id
         AND pss.company_id = p.company_id
         AND pss.store_id = $2
        LEFT JOIN stores s ON s.id = $2 AND s.company_id = p.company_id
        WHERE p.company_id = $1
        ORDER BY p.name
        LIMIT $3 OFFSET $4
        `,
        [req.user.companyId, req.user.storeId, limit, offset]
      );

      res.json({
        success: true,
        data: result.rows.map((row) => ({
          product: row.product,
          sku: row.sku,
          ean: row.ean,
          category: row.category,
          store: row.store_name || null,
          stock_quantity: Number(row.stock_quantity) || 0,
          cost_price: row.cost_price !== null ? Number(row.cost_price) : null,
          low_stock: row.low_stock === true,
        })).map(valuationRow).map((row) => ({
          product: row.product,
          sku: row.sku,
          ean: row.ean,
          category: row.category,
          store: row.store,
          stock_quantity: row.quantity,
          cost_price: row.cost_price,
          stock_value: row.stockValue,
          low_stock: row.low_stock,
        })),
      });
    } catch (error) {
      console.error("Inventory overview report error:", error);
      res.status(500).json({ success: false, message: "Unable to load inventory overview report" });
    }
  });


  /*
   * T10R - same ledger, extended filters: reason (Wastage / Breakage /
   * Other, matched against the stored reason text), productId, category
   * (product category name), movementTypes + productIds lists. All optional
   * and backward compatible; company/store isolation unchanged.
   */
  router.get("/reports/inventory-movements", authenticate, authorize("reports.inventory_movements.view", "inventory.movements.view"), async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(10000, Number(req.query.limit) || 500));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const companyId = req.user.companyId;
      const storeId = req.user.storeId;
      const dateFrom = req.query.dateFrom || null;
      const dateTo = req.query.dateTo || null;

      const whereClauses = ["m.company_id = $1", "m.store_id = $2"];
      const params = [companyId, storeId];

      if (dateFrom || dateTo) {
        params.push(dateFrom || "1970-01-01", dateTo || "2099-12-31");
        whereClauses.push("(m.created_at AT TIME ZONE c.timezone)::date >= $3::date");
        whereClauses.push("(m.created_at AT TIME ZONE c.timezone)::date <= $4::date");
      } else {
        params.push(null, null);
      }

      const push = (clause, value) => {
        params.push(value);
        whereClauses.push(clause.replace("$$", `$${params.length}`));
      };

      const listParam = (value) => String(value || "").split(",").map((v) => v.trim()).filter(Boolean);

      if (req.query.reason) {
        const wanted = String(req.query.reason).trim().toLowerCase();
        if (!["wastage", "breakage", "other"].includes(wanted)) {
          return res.status(400).json({ success: false, message: "Invalid reason filter: use Wastage, Breakage or Other" });
        }
        if (wanted === "other") {
          whereClauses.push("(m.reason IS NULL OR NOT (LOWER(m.reason) IN ('wastage','wasted','waste','breakage','broken','damage','damaged')))");
        } else if (wanted === "wastage") {
          whereClauses.push("(LOWER(m.reason) IN ('wastage','wasted','waste'))");
        } else {
          whereClauses.push("(LOWER(m.reason) IN ('breakage','broken','damage','damaged'))");
        }
      }

      if (req.query.productId) push("m.product_id = $$", req.query.productId);
      for (const id of listParam(req.query.productIds)) push("m.product_id = $$", id);
      if (req.query.category) push("LOWER(cat.name) LIKE LOWER($$)", `%${req.query.category}%`);
      for (const t of listParam(req.query.movementTypes)) push("m.movement_type = $$", t);

      const rowsSql = `
        SELECT
          m.id,
          m.created_at,
          p.name AS product,
          p.sku,
          p.barcode AS ean,
          COALESCE(cat.name, '-') AS category,
          p.cost_price,
          s.name AS store_name,
          m.movement_type,
          m.quantity_change,
          (m.quantity_change * COALESCE(p.cost_price, 0)) AS line_value,
          m.balance_after,
          m.reference_type,
          m.reference_id,
          u.username,
          m.reason
        FROM inventory_movements m
        INNER JOIN products p ON p.id = m.product_id
        INNER JOIN companies c ON c.id = m.company_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN stores s ON s.id = m.store_id
        LEFT JOIN users u ON u.id = m.created_by
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limit, offset);

      const rowsResult = await db(rowsSql, params);

      const countParams = params.slice(0, params.length - 2);
      const countSql = `
        SELECT COUNT(*)::int AS total,
          COALESCE(SUM(m.quantity_change), 0) AS quantity,
          COALESCE(SUM(m.quantity_change * COALESCE(p.cost_price, 0)), 0) AS value
        FROM inventory_movements m
        INNER JOIN products p ON p.id = m.product_id
        INNER JOIN companies c ON c.id = m.company_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        WHERE ${whereClauses.join(" AND ")}
      `;
      const totalResult = await db(countSql, countParams);

      res.json({
        success: true,
        data: {
          rows: rowsResult.rows.map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            product: row.product,
            sku: row.sku,
            ean: row.ean,
            category: row.category,
            costPrice: row.cost_price !== null ? Number(row.cost_price) : null,
            storeName: row.store_name,
            movementType: row.movement_type,
            quantityChange: Number(row.quantity_change),
            lineValue: row.line_value !== null ? Number(row.line_value) : null,
            balanceAfter: row.balance_after !== null ? Number(row.balance_after) : null,
            referenceType: row.reference_type,
            referenceId: row.reference_id,
            createdBy: row.username,
            reason: row.reason,
          })),
          total: Number(totalResult.rows[0]?.total ?? 0),
          quantity: Number(totalResult.rows[0]?.quantity ?? 0),
          value: Number(totalResult.rows[0]?.value ?? 0),
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error("Inventory movements report error:", error);
      res.status(500).json({ success: false, message: "Unable to load inventory movements report" });
    }
  });

  router.get("/reports/sales/overview", authenticate, authorize("reports.sales.view"), async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const by = ["day", "store", "user", "product"].includes(String(req.query.by || "day")) ? String(req.query.by || "day") : "day";
      const dateFrom = req.query.dateFrom || null;
      const dateTo = req.query.dateTo || null;
      const companyWide = canViewCompanyCustomers ? await canViewCompanyCustomers(req.user) : false;
      let visibleStoreIds = null;
      if (!companyWide) {
        const stores = await db("SELECT id FROM stores WHERE company_id = $1 AND active = true ORDER BY name", [companyId]);
        visibleStoreIds = [];
        for (const store of stores.rows) {
          if (!canAccessStore || await canAccessStore(req.user, store.id)) visibleStoreIds.push(store.id);
        }
      }
      let storeFilter = null;
      if (req.query.storeId) {
        storeFilter = String(req.query.storeId);
        const exists = await db("SELECT id FROM stores WHERE id = $1 AND company_id = $2 LIMIT 1", [storeFilter, companyId]);
        if (!exists.rows.length) return res.status(404).json({ success: false, message: "Store not found" });
        if (visibleStoreIds && !visibleStoreIds.includes(storeFilter)) return res.status(403).json({ success: false, message: "You do not have permission to view this store's sales reports" });
      }
      let userFilter = null;
      if (req.query.userId) {
        userFilter = String(req.query.userId);
        const exists = await db("SELECT id FROM users WHERE id = $1 AND company_id = $2 LIMIT 1", [userFilter, companyId]);
        if (!exists.rows.length) return res.status(404).json({ success: false, message: "User not found" });
      }
      if (visibleStoreIds && !visibleStoreIds.length) return res.json({ success: true, data: { by, rows: [], totals: { total_qty: 0, total_sales: 0, total_returns: 0, total_discount: 0, total_tax: 0, count_sales: 0, count_returns: 0, distinct_products: 0, net_sales: 0 }, payments: [] } });

      const storeScope = storeFilter || visibleStoreIds;
      const groupSelect = by === "store" ? "s.store_id AS group_key" : by === "user" ? "s.user_id AS group_key" : by === "product" ? "si.product_id AS group_key" : "(s.created_at AT TIME ZONE c.timezone)::date AS group_key";
      const groupExpr = by === "store" ? "s.store_id" : by === "user" ? "s.user_id" : by === "product" ? "si.product_id" : "(s.created_at AT TIME ZONE c.timezone)::date";
      const labelSelect = by === "store" ? "st.name AS group_label" : by === "user" ? "COALESCE(u.full_name, u.username, 'Unknown') AS group_label" : by === "product" ? "p.name AS group_label" : "NULL AS group_label";
      const joins = ["INNER JOIN companies c ON c.id = s.company_id", "INNER JOIN sale_items si ON si.sale_id = s.id", by === "store" ? "LEFT JOIN stores st ON st.id = s.store_id" : "", by === "user" ? "LEFT JOIN users u ON u.id = s.user_id" : "", by === "product" ? "LEFT JOIN products p ON p.id = si.product_id" : ""].filter(Boolean).join(" ");
      const where = "s.company_id = $1 AND s.status = 'completed' AND ($2::text IS NULL OR s.store_id = ANY($2::uuid[])) AND ($3::uuid IS NULL OR s.user_id = $3) AND ($4::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date >= $4::date) AND ($5::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date <= $5::date)";
      const result = await db(`WITH sales_agg AS (
        SELECT ${groupSelect}, ${labelSelect}, COUNT(DISTINCT s.id)::int AS count_sales,
          COALESCE(SUM(si.quantity), 0) AS total_qty, COALESCE(SUM(si.total), 0) AS total_sales,
          COALESCE(SUM(si.discount), 0) AS total_discount, COALESCE(SUM(si.tax), 0) AS total_tax,
          COUNT(DISTINCT si.product_id)::int AS distinct_products
        FROM sales s ${joins} WHERE ${where} GROUP BY ${groupExpr}, group_label
      ), returns_agg AS (
        SELECT ${by === "store" ? "sr.store_id" : by === "user" ? "sr.created_by" : by === "product" ? "sri.product_id" : "(sr.created_at AT TIME ZONE c.timezone)::date"} AS group_key,
          COALESCE(SUM(sri.quantity * si.unit_price), 0) AS total_returns,
          COALESCE(SUM(sri.quantity), 0) AS total_return_qty,
          COUNT(DISTINCT sr.id)::int AS count_returns
        FROM stock_returns sr INNER JOIN stock_return_items sri ON sri.return_id = sr.id INNER JOIN sale_items si ON si.id = sri.sale_item_id INNER JOIN companies c ON c.id = sr.company_id
        WHERE sr.company_id = $1 AND sr.return_type = 'CUSTOMER' AND ($2::text IS NULL OR sr.store_id = ANY($2::uuid[])) AND ($3::uuid IS NULL OR sr.created_by = $3)
          AND ($4::date IS NULL OR (sr.created_at AT TIME ZONE c.timezone)::date >= $4::date) AND ($5::date IS NULL OR (sr.created_at AT TIME ZONE c.timezone)::date <= $5::date)
        GROUP BY group_key
      ) SELECT sales_agg.*, COALESCE(returns_agg.total_returns, 0) AS total_returns,
        COALESCE(returns_agg.total_return_qty, 0) AS total_return_qty,
        COALESCE(returns_agg.count_returns, 0) AS count_returns
        FROM sales_agg LEFT JOIN returns_agg USING (group_key) ORDER BY group_key`, [companyId, storeScope, userFilter, dateFrom, dateTo]);
      const payments = await db(`SELECT pay.payment_method AS method, COALESCE(SUM(pay.amount), 0) AS total_sales, COUNT(DISTINCT pay.sale_id)::int AS count_sales
        FROM sales s INNER JOIN payments pay ON pay.sale_id = s.id INNER JOIN companies c ON c.id = s.company_id
        WHERE ${where} GROUP BY pay.payment_method ORDER BY total_sales DESC`, [companyId, storeScope, userFilter, dateFrom, dateTo]);
      const distinctProducts = await db(`SELECT COUNT(DISTINCT si.product_id)::int AS distinct_products
        FROM sales s INNER JOIN sale_items si ON si.sale_id = s.id INNER JOIN companies c ON c.id = s.company_id
        WHERE ${where}`, [companyId, storeScope, userFilter, dateFrom, dateTo]);
      const rows = result.rows.map((row) => {
        const key = by === "day" && row.group_key instanceof Date ? row.group_key.toISOString().slice(0, 10) : String(row.group_key);
        const totalSales = Number(row.total_sales ?? row.gross_sales ?? 0);
        const totalReturns = Number(row.total_returns ?? row.returned_value ?? 0);
        return {
          key,
          label: row.group_label || key,
          total_qty: Number(row.total_qty ?? row.quantity ?? 0),
          total_sales: totalSales,
          total_returns: totalReturns,
          total_discount: Number(row.total_discount ?? row.discounts ?? 0),
          total_tax: Number(row.total_tax ?? row.vat ?? 0),
          count_sales: Number(row.count_sales ?? row.transactions ?? 0),
          count_returns: Number(row.count_returns || 0),
          distinct_products: Number(row.distinct_products || 0),
          net_sales: totalSales - totalReturns,
        };
      });
      if (by === "store" || by === "user") {
        const ids = rows.map((row) => row.key).filter(Boolean);
        if (ids.length) {
          const lookup = by === "store"
            ? await db("SELECT id,name FROM stores WHERE company_id=$1 AND id=ANY($2::uuid[])", [companyId, ids])
            : await db("SELECT id,COALESCE(full_name,username) AS name FROM users WHERE company_id=$1 AND id=ANY($2::uuid[])", [companyId, ids]);
          const names = new Map(lookup.rows.map((entry) => [String(entry.id), entry.name]));
          for (const row of rows) row.label = names.get(String(row.key)) || row.label;
        }
      }
      const totals = rows.reduce((sum, row) => {
        for (const key of ["total_qty", "total_sales", "total_returns", "total_discount", "total_tax", "count_sales", "count_returns"]) sum[key] += row[key];
        sum.distinct_products += row.distinct_products;
        return sum;
      }, { total_qty: 0, total_sales: 0, total_returns: 0, total_discount: 0, total_tax: 0, count_sales: 0, count_returns: 0, distinct_products: 0 });
      totals.distinct_products = Number(distinctProducts.rows[0]?.distinct_products ?? (by === "product" ? rows.length : totals.distinct_products));
      totals.net_sales = totals.total_sales - totals.total_returns;
      res.json({ success: true, data: { by, rows, totals, payments: payments.rows.map((row) => ({ method: row.method, total_sales: Number(row.total_sales ?? row.total ?? 0), count_sales: Number(row.count_sales ?? row.transactions ?? 0) })) } });
    } catch (error) {
      console.error("Sales overview report error:", error);
      res.status(500).json({ success: false, message: "Unable to load sales overview report" });
    }
  });

  router.get("/reports/till", authenticate, authorize("reports.till.view"), async (req, res) => {
    try {
      const result = await db(
        `
        SELECT ts.id, ts.status, ts.opened_at, ts.closed_at, ts.opening_cash, ts.closing_cash,
               ts.expected_cash, ts.cash_difference,
               (ts.opened_at AT TIME ZONE c.timezone)::date AS business_date,
               t.name AS terminal_name, u.username AS opened_by_name, cl.username AS closed_by_name,
               COALESCE(SUM(CASE WHEN cm.type = 'cash_in' THEN cm.amount ELSE 0 END), 0) AS cash_in_total,
               COALESCE(SUM(CASE WHEN cm.type = 'cash_out' THEN cm.amount ELSE 0 END), 0) AS cash_out_total,
               (
                 SELECT COALESCE(SUM(sa.total), 0)
                 FROM sales sa
                 INNER JOIN payments pa ON pa.sale_id = sa.id
                 WHERE sa.company_id = ts.company_id
                   AND sa.store_id = ts.store_id
                   AND sa.terminal_id = ts.terminal_id
                   AND pa.payment_method = 'cash'
                   AND sa.status = 'completed'
                   AND sa.created_at BETWEEN ts.opened_at AND COALESCE(ts.closed_at, NOW())
               ) AS cash_sales,
               (
                 SELECT COALESCE(SUM(r.amount), 0)
                 FROM refunds r
                 INNER JOIN sales rs ON rs.id = r.sale_id
                 WHERE rs.company_id = ts.company_id
                   AND rs.store_id = ts.store_id
                   AND rs.terminal_id = ts.terminal_id
                   AND r.payment_method = 'cash'
                   AND r.created_at BETWEEN ts.opened_at AND COALESCE(ts.closed_at, NOW())
               ) AS cash_refunds
        FROM till_sessions ts
        INNER JOIN terminals t ON t.id = ts.terminal_id
        INNER JOIN stores st ON st.id = ts.store_id
        INNER JOIN companies c ON c.id = st.company_id
        LEFT JOIN users u ON u.id = ts.user_id
        LEFT JOIN users cl ON cl.id = ts.closed_by
        LEFT JOIN cash_movements cm ON cm.till_session_id = ts.id
        WHERE ts.company_id = $1 AND ts.store_id = $2
          AND ($3::date IS NULL OR (ts.opened_at AT TIME ZONE c.timezone)::date >= $3::date)
          AND ($4::date IS NULL OR (ts.opened_at AT TIME ZONE c.timezone)::date <= $4::date)
        GROUP BY ts.id, t.name, u.username, cl.username, c.timezone, st.id
        ORDER BY ts.opened_at DESC
        `,
        scopedReportParams(req)
      );
      const sessions = result.rows.map((row) => {
        const opening = Number(row.opening_cash) || 0;
        const cashIn = Number(row.cash_in_total) || 0;
        const cashOut = Number(row.cash_out_total) || 0;
        const cashSales = Number(row.cash_sales) || 0;
        const cashRefunds = Number(row.cash_refunds) || 0;
        const closed = row.status === "closed";
        /* Closed sessions report the authoritative values persisted at close
         * time verbatim — never a recomputation that could disagree. */
        const expected = closed
          ? Number(row.expected_cash) || 0
          : opening + cashIn + cashSales - cashOut - cashRefunds;
        const difference = closed ? Number(row.cash_difference) || 0 : null;
        const varianceStatus = closed
          ? difference < -0.004 ? "short" : difference > 0.004 ? "over" : "exact"
          : null;
        return {
          id: row.id,
          terminal: row.terminal_name,
          openedBy: row.opened_by_name,
          closedBy: row.closed_by_name,
          status: row.status,
          businessDate: row.business_date,
          openedAt: row.opened_at,
          closedAt: row.closed_at,
          openingCash: opening,
          cashIn,
          cashOut,
          cashSales,
          cashRefunds,
          expectedClosing: expected,
          actualClosing: closed ? Number(row.closing_cash) || 0 : null,
          difference,
          varianceStatus,
        };
      });
      const summary = sessions.reduce(
        (acc, s) => ({
          sessions: acc.sessions + 1,
          openingCash: acc.openingCash + s.openingCash,
          cashIn: acc.cashIn + s.cashIn,
          cashOut: acc.cashOut + s.cashOut,
          cashSales: acc.cashSales + s.cashSales,
          cashRefunds: acc.cashRefunds + s.cashRefunds,
          expectedClosing: acc.expectedClosing + s.expectedClosing,
          actualClosing: acc.actualClosing + (s.actualClosing || 0),
          difference: acc.difference + (s.difference || 0),
        }),
        { sessions: 0, openingCash: 0, cashIn: 0, cashOut: 0, cashSales: 0, cashRefunds: 0, expectedClosing: 0, actualClosing: 0, difference: 0 }
      );
      res.json({ success: true, data: { summary, sessions } });
    } catch (error) { console.error("Till report error:", error); res.status(500).json({ success: false, message: "Unable to load till report" }); }
  });

  /*
   * GET /api/reports/till/:sessionId
   * Daily-till-close session detail: authoritative session reconciliation
   * (stored expected/actual/variance — never recomputed) plus the session's
   * cash-movement audit trail. Read-only, company+store scoped, and usable
   * by report viewers without cash.adjustment/cash.payout permissions.
   */
  router.get("/reports/till/:sessionId", authenticate, authorize("reports.till.view"), async (req, res) => {
    try {
      const session = await db(
        `
        SELECT ts.id, ts.status, ts.opened_at, ts.closed_at, ts.opening_cash, ts.closing_cash,
               ts.expected_cash, ts.cash_difference,
               (ts.opened_at AT TIME ZONE c.timezone)::date AS business_date,
               t.name AS terminal_name, u.username AS opened_by_name, cl.username AS closed_by_name,
               COALESCE((SELECT SUM(amount) FROM cash_movements cm WHERE cm.till_session_id = ts.id AND cm.type = 'cash_in'), 0) AS cash_in_total,
               COALESCE((SELECT SUM(amount) FROM cash_movements cm WHERE cm.till_session_id = ts.id AND cm.type = 'cash_out'), 0) AS cash_out_total,
               (
                 SELECT COALESCE(SUM(sa.total), 0)
                 FROM sales sa
                 INNER JOIN payments pa ON pa.sale_id = sa.id
                 WHERE sa.company_id = ts.company_id
                   AND sa.store_id = ts.store_id
                   AND sa.terminal_id = ts.terminal_id
                   AND pa.payment_method = 'cash'
                   AND sa.status = 'completed'
                   AND sa.created_at BETWEEN ts.opened_at AND COALESCE(ts.closed_at, NOW())
               ) AS cash_sales,
               (
                 SELECT COALESCE(SUM(r.amount), 0)
                 FROM refunds r
                 INNER JOIN sales rs ON rs.id = r.sale_id
                 WHERE rs.company_id = ts.company_id
                   AND rs.store_id = ts.store_id
                   AND rs.terminal_id = ts.terminal_id
                   AND r.payment_method = 'cash'
                   AND r.created_at BETWEEN ts.opened_at AND COALESCE(ts.closed_at, NOW())
               ) AS cash_refunds
        FROM till_sessions ts
        INNER JOIN terminals t ON t.id = ts.terminal_id
        INNER JOIN stores st ON st.id = ts.store_id
        INNER JOIN companies c ON c.id = st.company_id
        LEFT JOIN users u ON u.id = ts.user_id
        LEFT JOIN users cl ON cl.id = ts.closed_by
        WHERE ts.id = $3 AND ts.company_id = $1 AND ts.store_id = $2
        `,
        [req.user.companyId, req.user.storeId, req.params.sessionId]
      );
      if (!session.rows.length) {
        return res.status(404).json({ success: false, message: "Till session not found" });
      }
      const row = session.rows[0];
      const opening = Number(row.opening_cash) || 0;
      const cashIn = Number(row.cash_in_total) || 0;
      const cashOut = Number(row.cash_out_total) || 0;
      const cashSales = Number(row.cash_sales) || 0;
      const cashRefunds = Number(row.cash_refunds) || 0;
      const closed = row.status === "closed";
      const difference = closed ? Number(row.cash_difference) || 0 : null;
      const movements = await db(
        `SELECT cm.id, cm.type, cm.amount, cm.reason, cm.created_at, u.username
         FROM cash_movements cm
         LEFT JOIN users u ON u.id = cm.user_id
         WHERE cm.till_session_id = $3
         ORDER BY cm.created_at DESC
         LIMIT 200`,
        [req.user.companyId, req.user.storeId, req.params.sessionId]
      );
      res.json({
        success: true,
        data: {
          session: {
            id: row.id,
            terminal: row.terminal_name,
            openedBy: row.opened_by_name,
            closedBy: row.closed_by_name,
            status: row.status,
            businessDate: row.business_date,
            openedAt: row.opened_at,
            closedAt: row.closed_at,
            openingCash: opening,
            cashIn,
            cashOut,
            cashSales,
            cashRefunds,
            expectedClosing: closed ? Number(row.expected_cash) || 0 : opening + cashIn + cashSales - cashOut - cashRefunds,
            actualClosing: closed ? Number(row.closing_cash) || 0 : null,
            difference,
            varianceStatus: closed
              ? difference < -0.004 ? "short" : difference > 0.004 ? "over" : "exact"
              : null,
          },
          movements: movements.rows.map((m) => ({
            id: m.id,
            type: m.type,
            amount: Number(m.amount) || 0,
            reason: m.reason,
            username: m.username,
            createdAt: m.created_at,
          })),
        },
      });
    } catch (error) { console.error("Till session detail error:", error); res.status(500).json({ success: false, message: "Unable to load till session detail" }); }
  });

  router.get("/reports/vat", authenticate, authorize("reports.vat.view"), async (req, res) => {
    try {
      const result = await db(
        `
        WITH sales_total AS (
          SELECT COALESCE(SUM(s.total),0) gross_sales, COALESCE(SUM(s.discount),0) discounts, COALESCE(SUM(s.tax),0) vat
          FROM sales s INNER JOIN companies c ON c.id=s.company_id
          WHERE s.company_id=$1 AND s.store_id=$2 AND s.status='completed'
            AND ($3::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date >= $3::date)
            AND ($4::date IS NULL OR (s.created_at AT TIME ZONE c.timezone)::date <= $4::date)
        ), returns_total AS (
          SELECT COALESCE(SUM(sri.quantity * si.unit_price),0) returned_value,
                 COALESCE(SUM(sri.quantity * si.tax),0) returned_vat
          FROM stock_returns sr
          INNER JOIN stock_return_items sri ON sri.return_id=sr.id
          INNER JOIN sale_items si ON si.id=sri.sale_item_id
          INNER JOIN companies c ON c.id=sr.company_id
          WHERE sr.company_id=$1 AND sr.store_id=$2 AND sr.return_type='CUSTOMER'
            AND ($3::date IS NULL OR sr.created_at::date >= $3::date)
            AND ($4::date IS NULL OR sr.created_at::date <= $4::date)
        ) SELECT sales_total.gross_sales, sales_total.discounts, sales_total.vat, returns_total.returned_value, returns_total.returned_vat FROM sales_total, returns_total
        `,
        scopedReportParams(req)
      );
      const row = result.rows[0];
      const gross = Number(row.gross_sales);
      const discounts = Number(row.discounts);
      const vat = Number(row.vat);
      const returned = Number(row.returned_value);
      const returnedVat = Number(row.returned_vat);
      res.json({
        success: true,
        data: {
          grossSales: gross,
          discounts,
          netSales: gross - returned,
          vat,
          salesExVat: gross - vat,
          returns: returned,
          returnsVat: returnedVat,
          vatAfterReturns: vat - returnedVat,
        },
      });
    } catch (error) { console.error("VAT report error:", error); res.status(500).json({ success: false, message: "Unable to load VAT report" }); }
  });

  const isCompanyAdmin = async (user) => (
    canViewCompanyCustomers ? canViewCompanyCustomers(user) : false
  );
  const reportById = async (req, id) => {
    const admin = await canManageReports(req);
    const result = await db(
      `SELECT cr.*, EXISTS (SELECT 1 FROM custom_report_users cru WHERE cru.report_id=cr.id AND cru.user_id=$3) AS mapped
       FROM custom_reports cr
       WHERE cr.id=$1 AND cr.company_id=$2 AND cr.archived_at IS NULL
         AND ($4 OR cr.created_by=$3 OR EXISTS (SELECT 1 FROM custom_report_users cru WHERE cru.report_id=cr.id AND cru.user_id=$3))`,
      [id, req.user.companyId, req.user.id, admin]
    );
    const report = result.rows[0] || null;
    if (!report || !report.folder_id || admin) return report;
    return (await visibleFolder(req, report.folder_id, "VIEW")) ? report : null;
  };
  const accessibleStores = async (req, storeIds) => {
    const admin = await isCompanyAdmin(req.user);
    const ids = [...new Set((storeIds || []).filter(Boolean).map(String))];
    if (!ids.length && !admin) {
      if (!req.user.storeId || (canAccessStore && !(await canAccessStore(req.user, String(req.user.storeId))))) {
        throw new Error("A store assignment is required to run a custom report");
      }
      return [String(req.user.storeId)];
    }
    if (!ids.length) return [];
    if (!admin) {
      for (const id of ids) {
        if (!canAccessStore || !(await canAccessStore(req.user, id))) throw new Error("You do not have access to one or more stores");
      }
    }
    const result = await db("SELECT id FROM stores WHERE company_id=$1 AND id = ANY($2::uuid[])", [req.user.companyId, ids]);
    if (result.rows.length !== ids.length) throw new Error("One or more stores were not found");
    return ids;
  };
  const requestedStoreIds = (definition) => [
    ...(definition.storeIds || []),
    ...((definition.filters || []).flatMap((filter) => filter?.field === "store"
      ? (Array.isArray(filter.value) ? filter.value : [filter.value]) : [])),
  ];
  const canManageReports = async (req) => (
    hasSystemPermission ? hasSystemPermission(req, "reports.custom.manage") : false
  );
  const canManageReportTypes = async (req) => (
    (await canManageReports(req))
    || (hasSystemPermission ? await hasSystemPermission(req, "platform.metadata.manage") : false)
  );
  const reportTypeIsVisible = async (req, row) => {
    const status = String(
      row?.definition?.experience?.status
      || row?.definition?.status
      || row?.status
      || "IN_DEVELOPMENT"
    ).toUpperCase();
    return status === "DEPLOYED" || (await canManageReportTypes(req));
  };

  async function resolveCustomReportType(req, reportTypeId) {
    if (!reportTypeId) return null;
    const result = await db("SELECT * FROM custom_report_types WHERE id=$1 AND company_id=$2 AND active=TRUE", [reportTypeId, req.user.companyId]);
    const row = result.rows[0];
    if (!row) throw new Error("Custom report type is unavailable");
    const definition = normalizeReportType({ ...(row.definition || {}), id: row.id });
    if (!(await reportTypeIsVisible(req, row))) throw new Error("Custom report type is not deployed");
    const context = await platformReportContext(req, definition.primaryObjectId);
    const relationshipConfig = new Map((definition.relationships || []).map((entry) => [String(entry.relationshipId), entry]));
    const relationships = (context.relationships || [])
      .filter((relationship) => relationshipConfig.has(String(relationship.id)))
      .map((relationship) => ({ ...relationship, reportJoinType: relationshipConfig.get(String(relationship.id)).joinType }));
    const experience = definition.experience || {};
    const layoutMap = new Map((experience.fieldLayout || []).map((entry) => [String(entry.fieldKey), entry]));
    const visibilityMap = new Map((definition.fieldVisibility || []).map((entry) => [String(entry.fieldKey), entry]));
    const fields = (context.fields || []).filter((field) => {
      const key = String(field.api_name);
      const layout = layoutMap.get(key);
      const visibility = visibilityMap.get(key);
      return layout?.visible !== false && visibility?.visible !== false;
    }).map((field) => {
      const layout = layoutMap.get(String(field.api_name));
      return layout?.displayLabel ? { ...field, label: layout.displayLabel } : field;
    });
    return { row, definition, context: { ...context, fields, relationships } };
  }

  async function visibleFolder(req, folderId, minimum = "VIEW") {
    if (!folderId) return null;
    const result = await db("SELECT * FROM report_folders WHERE id=$1 AND company_id=$2", [folderId, req.user.companyId]);
    const folder = result.rows[0];
    if (!folder) return null;
    return await resolveAnalyticsPrincipalAccess(db, folder.access, folder.created_by, req.user, minimum) ? folder : null;
  }

  async function executeCustomDefinition(req, inputDefinition, { preview = false } = {}) {
    const definition = validateCustomReportDefinition(inputDefinition);
    const executeBase = async (baseDefinition) => {
      if (baseDefinition.dataSource === "platform_object") {
        const reportType = await resolveCustomReportType(req, baseDefinition.reportTypeId || baseDefinition.report_type_id || null);
        const context = reportType?.context || await platformReportContext(req, baseDefinition.objectId);
        const validated = validatePlatformReportDefinition(baseDefinition, context.object, context.fields, context.relationships);
        const built = buildPlatformObjectQuery(validated, context.object, context.fields, req.user.companyId, preview ? 100 : 1000, {
          storeId: req.user.storeId,
          visibilitySql: context.visibilitySql,
          visibilityParams: context.visibilityParams,
        }, context.relationships);
        const result = await db(built.sql, built.params);
        return {
          columns: validated.fields.map((key) => ({ key, label: context.fields.find((field) => field.api_name === key)?.label || key })),
          rows: result.rows,
        };
      }
      const stores = await accessibleStores(req, requestedStoreIds(baseDefinition));
      const users = baseDefinition.userIds || [];
      if (users.length) {
        const valid = await db("SELECT id FROM users WHERE company_id=$1 AND id=ANY($2::uuid[])", [req.user.companyId, users]);
        if (valid.rows.length !== users.length) throw new Error("One or more users were not found");
      }
      const range = customDateRange(baseDefinition.filters);
      const built = buildCustomSalesQuery(baseDefinition, range, stores, users);
      built.params[2] = req.user.companyId;
      const result = await db(built.sql, built.params);
      return { columns: baseDefinition.fields.map((key) => ({ key, label: CUSTOM_FIELD_MAP.get(key)?.label || key })), rows: result.rows };
    };
    return executeAnalyticsDefinition(definition, executeBase, { preview });
  }

  async function recordReportView(req, reportId) {
    await db(
      `INSERT INTO report_user_preferences(company_id,user_id,report_id,last_viewed_at,view_count)
       VALUES($1,$2,$3,NOW(),1)
       ON CONFLICT(user_id,report_id)
       DO UPDATE SET last_viewed_at=NOW(),view_count=report_user_preferences.view_count+1`,
      [req.user.companyId, req.user.id, reportId]
    );
  }

  router.get("/reports/custom/capabilities", authenticate, authorize("reports.custom.view"), (_req, res) => {
    res.json({ success: true, data: reportCapabilities() });
  });

  router.get("/reports/custom/report-types", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const result = await db("SELECT * FROM custom_report_types WHERE company_id=$1 AND active=TRUE ORDER BY lower(label)", [req.user.companyId]);
      const visible = [];
      for (const row of result.rows || []) if (await reportTypeIsVisible(req, row)) visible.push(row);
      res.json({ success: true, data: visible });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load report types" }); }
  });

  router.post("/reports/custom/report-types", authenticate, authorize("reports.custom.manage"), async (req, res) => {
    try {
      const definition = normalizeReportType({ ...req.body, experience: normalizeReportTypeExperience(req.body?.experience || req.body) });
      const object = await db("SELECT id FROM platform_objects WHERE id=$1 AND active=TRUE AND (company_id IS NULL OR company_id=$2)", [definition.primaryObjectId, req.user.companyId]);
      if (!object.rows[0]) return res.status(400).json({ success: false, message: "Primary object is unavailable" });
      const result = await db(
        `INSERT INTO custom_report_types(company_id,created_by,type_key,label,description,primary_object_id,definition,active)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
        [req.user.companyId, req.user.id, definition.key, definition.label, definition.description, definition.primaryObjectId, JSON.stringify(definition), definition.active]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to create report type" }); }
  });

  router.put("/reports/custom/report-types/:id", authenticate, authorize("reports.custom.manage"), async (req, res) => {
    try {
      const definition = normalizeReportType({ ...req.body, id: req.params.id, experience: normalizeReportTypeExperience(req.body?.experience || req.body) });
      const result = await db(
        `UPDATE custom_report_types SET type_key=$3,label=$4,description=$5,primary_object_id=$6,definition=$7::jsonb,active=$8,updated_at=NOW()
         WHERE id=$1 AND company_id=$2 RETURNING *`,
        [req.params.id, req.user.companyId, definition.key, definition.label, definition.description, definition.primaryObjectId, JSON.stringify(definition), definition.active]
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, message: "Report type not found" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update report type" }); }
  });

  router.get("/reports/custom/folders", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const result = await db("SELECT * FROM report_folders WHERE company_id=$1 ORDER BY lower(name)", [req.user.companyId]);
      const visible = [];
      for (const folder of result.rows || []) {
        if (await resolveAnalyticsPrincipalAccess(db, folder.access, folder.created_by, req.user, "VIEW")) visible.push(folder);
      }
      res.json({ success: true, data: visible });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load report folders" }); }
  });

  router.post("/reports/custom/folders", authenticate, authorize("reports.custom.manage"), async (req, res) => {
    try {
      const folder = normalizeFolder(req.body);
      const result = await db(
        "INSERT INTO report_folders(company_id,created_by,name,description,visibility,access) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING *",
        [req.user.companyId, req.user.id, folder.name, folder.description, folder.visibility, JSON.stringify(folder.access)]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to create report folder" }); }
  });

  router.put("/reports/custom/folders/:id", authenticate, authorize("reports.custom.manage"), async (req, res) => {
    try {
      if (!(await visibleFolder(req, req.params.id, "MANAGE"))) return res.status(404).json({ success: false, message: "Report folder not found" });
      const folder = normalizeFolder(req.body);
      const result = await db(
        "UPDATE report_folders SET name=$3,description=$4,visibility=$5,access=$6::jsonb,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *",
        [req.params.id, req.user.companyId, folder.name, folder.description, folder.visibility, JSON.stringify(folder.access)]
      );
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { res.status(400).json({ success: false, message: error.message || "Unable to update report folder" }); }
  });

  router.get("/reports/custom/navigation", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const result = await db(
        `SELECT cr.id,cr.name,cr.folder_id,rup.favourite,rup.last_viewed_at,rup.view_count
         FROM custom_reports cr
         LEFT JOIN report_user_preferences rup ON rup.report_id=cr.id AND rup.user_id=$2
         WHERE cr.company_id=$1 AND cr.archived_at IS NULL
           AND (cr.created_by=$2 OR EXISTS(SELECT 1 FROM custom_report_users cru WHERE cru.report_id=cr.id AND cru.user_id=$2) OR $3)
         ORDER BY COALESCE(rup.last_viewed_at,cr.updated_at) DESC`,
        [req.user.companyId, req.user.id, await canManageReports(req)]
      );
      res.json({ success: true, data: { favourites: result.rows.filter((row) => row.favourite === true), recent: result.rows.filter((row) => row.last_viewed_at).slice(0,20) } });
    } catch (error) { res.status(500).json({ success: false, message: "Unable to load report navigation" }); }
  });

  router.get("/reports/custom/metadata", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const manage = await canManageReports(req);
      const [stores, users, reports, reportTypes, platformObjects] = await Promise.all([
        db("SELECT id,name FROM stores WHERE company_id=$1 AND active=true ORDER BY name", [req.user.companyId]),
        db("SELECT id,username,full_name FROM users WHERE company_id=$1 AND active=true ORDER BY full_name,username", [req.user.companyId]),
        db(`SELECT cr.id,cr.name,cr.description,cr.definition,cr.created_by,cr.folder_id,cr.report_type_id,
              COALESCE(array_agg(cru.user_id) FILTER (WHERE cru.user_id IS NOT NULL),'{}') AS user_ids,u.full_name AS created_by_name
            FROM custom_reports cr LEFT JOIN users u ON u.id=cr.created_by LEFT JOIN custom_report_users cru ON cru.report_id=cr.id
            WHERE cr.company_id=$1 AND cr.archived_at IS NULL AND ($2 OR cr.created_by=$3 OR EXISTS(SELECT 1 FROM custom_report_users x WHERE x.report_id=cr.id AND x.user_id=$3))
            GROUP BY cr.id,u.full_name ORDER BY cr.updated_at DESC`, [req.user.companyId, manage, req.user.id]),
        db("SELECT * FROM custom_report_types WHERE company_id=$1 AND active=TRUE ORDER BY lower(label)", [req.user.companyId]),
        db("SELECT id,object_key,label,source_table,company_id FROM platform_objects WHERE active=true AND source_table IS NOT NULL AND (company_id IS NULL OR company_id=$1) ORDER BY label", [req.user.companyId]),
      ]);
      res.json({ success: true, data: {
        fields: CUSTOM_REPORT_FIELDS.map(({ key,label,groupable,aggregate }) => ({ key,label,groupable:!!groupable,aggregate:!!aggregate,type:aggregate?"number":key==="date"?"date":"text" })),
        filters: CUSTOM_DATE_FILTERS,
        stores: stores.rows,
        users: users.rows,
        reports: reports.rows,
        reportTypes: await (async () => {
          const visible = [];
          for (const row of reportTypes.rows || []) if (await reportTypeIsVisible(req, row)) visible.push(row);
          return visible;
        })(),
        sources: STANDARD_REPORT_SOURCES,
        platformObjects: platformObjects.rows,
        capabilities: reportCapabilities(),
        canManage: manage,
      } });
    } catch (error) { console.error("Custom report metadata error:", error); res.status(500).json({ success:false,message:"Unable to load custom report metadata" }); }
  });

  router.get("/reports/custom", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const manage = canManageReports(req.user);
      const result = await db(
        `SELECT cr.id,cr.name,cr.description,cr.definition,cr.created_by,cr.updated_at,cr.folder_id,cr.report_type_id,
          COALESCE(array_agg(cru.user_id) FILTER (WHERE cru.user_id IS NOT NULL),'{}') AS user_ids,u.full_name AS created_by_name
         FROM custom_reports cr LEFT JOIN users u ON u.id=cr.created_by LEFT JOIN custom_report_users cru ON cru.report_id=cr.id
         WHERE cr.company_id=$1 AND cr.archived_at IS NULL AND ($2 OR cr.created_by=$3 OR EXISTS(SELECT 1 FROM custom_report_users x WHERE x.report_id=cr.id AND x.user_id=$3))
         GROUP BY cr.id,u.full_name ORDER BY cr.updated_at DESC`,
        [req.user.companyId, manage, req.user.id]
      );
      res.json({ success:true,data:result.rows });
    } catch (error) { res.status(500).json({ success:false,message:"Unable to load custom reports" }); }
  });

  router.get("/reports/custom/platform-objects/:objectId/metadata", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const context=await platformReportContext(req,req.params.objectId);
      if(!context.object||!context.object.source_table)return res.status(404).json({success:false,message:"Report object not found"});
      const fields=context.fields.map((field)=>({...field,key:field.api_name,type:field.field_type}));
      res.json({success:true,data:{object:context.object,fields,relationships:context.relationships.map(({fields:relatedFields,...relationship})=>({...relationship,fields:relatedFields.map((field)=>({...field,key:field.api_name,type:field.field_type}))}))}});
    } catch (error) { res.status(500).json({success:false,message:"Unable to load report object metadata"}); }
  });

  router.post("/reports/custom/preview", authenticate, authorize("reports.custom.view"), async (req, res) => {
    try {
      const previewPreference=normalizePreviewPreference(req.body?.previewPreference||{});
      const definition=validateCustomReportDefinition({...req.body,rowLimit:Math.min(Number(req.body?.rowLimit||previewPreference.sampleLimit),previewPreference.sampleLimit)});
      const data=await executeCustomDefinition(req,definition,{preview:true});
      res.json({success:true,data});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to preview custom report"});}
  });

  router.post("/reports/custom/subscriptions/run-due", authenticate, authorize("reports.custom.manage"), async (req,res)=>{
    try {
      const now=new Date();
      const due=await db("SELECT rs.*,cr.definition AS report_definition FROM report_subscriptions rs JOIN custom_reports cr ON cr.id=rs.report_id WHERE rs.company_id=$1 AND rs.active=TRUE",[req.user.companyId]);
      const executed=[];
      for(const row of due.rows||[]){
        const subscription=normalizeSubscription(row.definition);
        if(!subscriptionIsDue(subscription,now))continue;
        try {
          const actorResult=await db(
            "SELECT u.id,u.company_id,u.role_id,u.username,u.full_name FROM users u WHERE u.id=$1 AND u.company_id=$2 AND u.active=TRUE",
            [row.user_id,row.company_id]
          );
          const actor=actorResult.rows[0];
          if(!actor) throw new Error("Subscription owner is unavailable");
          const storeResult=await db(
            `SELECT us.store_id
               FROM user_stores us
               JOIN stores s ON s.id=us.store_id
              WHERE us.user_id=$1 AND us.active=TRUE AND s.company_id=$2 AND s.active=TRUE
              ORDER BY s.name,us.store_id LIMIT 1`,
            [actor.id,actor.company_id]
          );
          const syntheticReq=Object.create(req);
          syntheticReq.user={...req.user,id:actor.id,companyId:actor.company_id,roleId:actor.role_id,username:actor.username,full_name:actor.full_name,storeId:storeResult.rows?.[0]?.store_id||null};
          if(hasSystemPermission && !(await hasSystemPermission(syntheticReq,"reports.custom.view"))) {
            throw new Error("Subscription owner no longer has reports.custom.view");
          }
          const data=await executeCustomDefinition(syntheticReq,row.report_definition||{});
          const matched=subscriptionConditionMatches(subscription,data);
          let event=null;
          if(matched){
            event=await publishPlatformEvent({db,companyId:row.company_id,eventType:"report.subscription_due",actorUserId:actor.id,idempotencyKey:`report-subscription:${row.id}:${now.toISOString().slice(0,16)}`,payload:{subscriptionId:row.id,reportId:row.report_id,userId:row.user_id,delivery:subscription.delivery,recipients:subscription.recipients,condition:subscription.condition,result:{format:data.format,columns:data.columns,totals:data.totals||{},rowCount:(data.rows||[]).length,rows:(data.rows||[]).slice(0,100)}}});
          }
          await db("UPDATE report_subscriptions SET last_run_at=NOW(),last_delivery_at=CASE WHEN $2 THEN NOW() ELSE last_delivery_at END,last_status=$3 WHERE id=$1",[row.id,matched,matched?"QUEUED":"SKIPPED"]);
          executed.push({id:row.id,reportId:row.report_id,userId:row.user_id,matched,eventId:event?.event?.id||null,status:matched?"QUEUED":"SKIPPED"});
        } catch(subscriptionError) {
          await db("UPDATE report_subscriptions SET last_run_at=NOW(),last_status='FAILED' WHERE id=$1",[row.id]);
          executed.push({id:row.id,reportId:row.report_id,userId:row.user_id,matched:false,status:"FAILED",error:subscriptionError?.message||"Subscription execution failed"});
        }
      }
      res.json({success:true,data:executed});
    } catch(error){res.status(500).json({success:false,message:error.message||"Unable to run due subscriptions"});}
  });

  router.get("/reports/custom/:id/export", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const definition=validateCustomReportDefinition(report.definition||{});
      const exportConfig=normalizeReportExport({view:req.query.view,format:req.query.format},definition.format||"tabular");
      const data=await executeCustomDefinition(req,definition);
      const payload={report:{id:report.id,name:report.name,description:report.description,format:definition.format||"tabular"},columns:data.columns||[],rows:data.rows||[],totals:data.totals||{},groups:data.groups||[],filters:definition.filters||[]};
      const filename=String(report.name||"report").replace(/[^A-Za-z0-9_-]+/g,"_").slice(0,80)||"report";
      if(exportConfig.view==="FORMATTED"){const buffer=await buildFormattedXlsx(payload);res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");res.setHeader("Content-Disposition",`attachment; filename="${filename}.xlsx"`);return res.send(Buffer.from(buffer));}
      const csv=buildDetailsCsv(payload);res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",`attachment; filename="${filename}.csv"`);return res.send(`\uFEFF${csv}`);
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to export report"});}
  });

  router.get("/reports/custom/:id/history/compare", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const trend=normalizeHistoricalTrend(req.query?.trend?JSON.parse(String(req.query.trend)):{});
      const result=await db("SELECT id,captured_at,period_key,summary,row_count FROM report_snapshots WHERE report_id=$1 AND company_id=$2 ORDER BY captured_at DESC LIMIT 50",[req.params.id,req.user.companyId]);
      const snapshots=trend.snapshotDates.length?result.rows.filter((snapshot)=>trend.snapshotDates.includes(String(snapshot.period_key||snapshot.captured_at))).slice(0,5):result.rows.slice(0,5);
      res.json({success:true,data:{trend,snapshots}});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to compare historical report data"});}
  });

  router.get("/reports/custom/:id/history", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const result=await db("SELECT id,captured_at,period_key,summary,row_count FROM report_snapshots WHERE report_id=$1 AND company_id=$2 ORDER BY captured_at DESC LIMIT 100",[req.params.id,req.user.companyId]);
      res.json({success:true,data:result.rows});
    } catch(error){res.status(500).json({success:false,message:"Unable to load report history"});}
  });

  router.get("/reports/custom/:id/subscriptions", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    const report=await reportById(req,req.params.id);
    if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
    const result=await db("SELECT * FROM report_subscriptions WHERE report_id=$1 AND company_id=$2 AND user_id=$3 ORDER BY created_at DESC",[req.params.id,req.user.companyId,req.user.id]);
    res.json({success:true,data:result.rows});
  });

  router.post("/reports/custom/:id/subscriptions", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const definition=normalizeSubscription(req.body);
      const result=await db("INSERT INTO report_subscriptions(company_id,report_id,user_id,definition,active) VALUES($1,$2,$3,$4::jsonb,$5) RETURNING *",[req.user.companyId,req.params.id,req.user.id,JSON.stringify(definition),definition.active]);
      res.status(201).json({success:true,data:result.rows[0]});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to create subscription"});}
  });

  router.delete("/reports/custom/:id/subscriptions/:subscriptionId", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    await db("DELETE FROM report_subscriptions WHERE id=$1 AND report_id=$2 AND company_id=$3 AND user_id=$4",[req.params.subscriptionId,req.params.id,req.user.companyId,req.user.id]);
    res.json({success:true});
  });

  router.put("/reports/custom/:id/favourite", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      await db(`INSERT INTO report_user_preferences(company_id,user_id,report_id,favourite,last_viewed_at,view_count)
        VALUES($1,$2,$3,$4,NOW(),1)
        ON CONFLICT(user_id,report_id) DO UPDATE SET favourite=EXCLUDED.favourite`,
        [req.user.companyId,req.user.id,req.params.id,req.body?.favourite===true]);
      res.json({success:true});
    } catch(error){res.status(400).json({success:false,message:"Unable to update favourite"});}
  });

  router.put("/reports/custom/:id/folder", authenticate, authorize("reports.custom.edit"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"You cannot move this report"});
      const folderId=req.body?.folderId||null;
      if(folderId&&!(await visibleFolder(req,folderId,"EDIT")))return res.status(400).json({success:false,message:"Report folder is not available"});
      await db("UPDATE custom_reports SET folder_id=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId,folderId]);
      res.json({success:true});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to move report"});}
  });

  router.get("/reports/custom/:id", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});res.json({success:true,data:report});}
    catch(error){res.status(500).json({success:false,message:"Unable to load custom report"});}
  });

  router.post("/reports/custom", authenticate, authorize("reports.custom.create"), async (req,res)=>{
    try {
      const name=String(req.body?.name||"").trim();
      if(!name||name.length>150)return res.status(400).json({success:false,message:"A report name up to 150 characters is required"});
      const reportType=await resolveCustomReportType(req,req.body?.reportTypeId||req.body?.report_type_id||null);
      const sourceInput=reportType?{...req.body,dataSource:"platform_object",objectId:reportType.definition.primaryObjectId,reportTypeId:reportType.row.id}:req.body;
      const definition=validateCustomReportDefinition(sourceInput);
      if(definition.dataSource==="platform_object"){const context=reportType?.context||await platformReportContext(req,definition.objectId);validatePlatformReportDefinition(definition,context.object,context.fields,context.relationships);}
      const stores=definition.dataSource==="platform_object"?[]:await accessibleStores(req,requestedStoreIds(definition));
      const result=await db("INSERT INTO custom_reports(company_id,created_by,name,description,data_source,report_type_id,definition) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *",
        [req.user.companyId,req.user.id,name,String(req.body.description||"").slice(0,500),definition.dataSource||"sales",reportType?.row?.id||null,JSON.stringify({...definition,reportTypeId:reportType?.row?.id||null,storeIds:stores})]);
      res.status(201).json({success:true,data:result.rows[0]});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to create custom report"});}
  });

  router.put("/reports/custom/:id", authenticate, authorize("reports.custom.edit"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"Only the owner or a report manager can edit this report"});
      const name=String(req.body?.name||report.name).trim();
      const reportType=await resolveCustomReportType(req,req.body?.reportTypeId||req.body?.report_type_id||report.report_type_id||null);
      const sourceInput=reportType?{...req.body,dataSource:"platform_object",objectId:reportType.definition.primaryObjectId,reportTypeId:reportType.row.id}:req.body;
      const definition=validateCustomReportDefinition(sourceInput);
      if(definition.dataSource==="platform_object"){const context=reportType?.context||await platformReportContext(req,definition.objectId);validatePlatformReportDefinition(definition,context.object,context.fields,context.relationships);}
      const stores=definition.dataSource==="platform_object"?[]:await accessibleStores(req,requestedStoreIds(definition));
      const result=await db("UPDATE custom_reports SET name=$3,description=$4,data_source=$5,report_type_id=$6,definition=$7::jsonb,updated_at=NOW() WHERE id=$1 AND company_id=$2 RETURNING *",
        [req.params.id,req.user.companyId,name,String(req.body.description||report.description||"").slice(0,500),definition.dataSource||"sales",reportType?.row?.id||null,JSON.stringify({...definition,reportTypeId:reportType?.row?.id||null,storeIds:stores})]);
      res.json({success:true,data:result.rows[0]});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to update custom report"});}
  });

  router.delete("/reports/custom/:id", authenticate, authorize("reports.custom.edit"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"You cannot archive this report"});await db("UPDATE custom_reports SET archived_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2",[req.params.id,req.user.companyId]);res.json({success:true,data:{id:req.params.id}});}
    catch(error){res.status(500).json({success:false,message:"Unable to archive custom report"});}
  });

  router.post("/reports/custom/:id/duplicate", authenticate, authorize("reports.custom.create"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});const result=await db("INSERT INTO custom_reports(company_id,created_by,name,description,data_source,report_type_id,definition) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *",[req.user.companyId,req.user.id,`${report.name} (copy)`.slice(0,150),report.description,report.data_source,report.report_type_id||null,JSON.stringify(report.definition)]);res.status(201).json({success:true,data:result.rows[0]});}
    catch(error){res.status(500).json({success:false,message:"Unable to duplicate custom report"});}
  });

  router.put("/reports/custom/:id/users", authenticate, authorize("reports.custom.share"), async (req,res)=>{
    try{const report=await reportById(req,req.params.id);if(!report)return res.status(404).json({success:false,message:"Custom report not found"});if(String(report.created_by)!==String(req.user.id)&&!(await canManageReports(req)))return res.status(403).json({success:false,message:"You cannot share this report"});const userIds=validateUuidList(req.body?.userIds,"user");const valid=await db("SELECT id FROM users WHERE company_id=$1 AND active=true AND id=ANY($2::uuid[])",[req.user.companyId,userIds]);if(valid.rows.length!==userIds.length)return res.status(400).json({success:false,message:"One or more users were not found"});await db("DELETE FROM custom_report_users WHERE report_id=$1",[req.params.id]);for(const userId of userIds)await db("INSERT INTO custom_report_users(report_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[req.params.id,userId]);res.json({success:true,data:{userIds}});}
    catch(error){res.status(400).json({success:false,message:error.message||"Unable to map report users"});}
  });

  router.post("/reports/custom/:id/run", authenticate, authorize("reports.custom.view"), async (req,res)=>{
    try {
      const report=await reportById(req,req.params.id);
      if(!report)return res.status(404).json({success:false,message:"Custom report not found"});
      const definition=req.body&&Object.keys(req.body).length?{...report.definition,...req.body}:report.definition;
      const data=await executeCustomDefinition(req,definition);
      await recordReportView(req,req.params.id);
      const normalized=validateCustomReportDefinition(definition);
      if(normalized.snapshot===true||normalized.historicalTrend?.enabled===true){
        await db("INSERT INTO report_snapshots(company_id,report_id,period_key,summary,row_count) VALUES($1,$2,$3,$4::jsonb,$5)",
          [req.user.companyId,req.params.id,String(normalized.snapshotPeriod||new Date().toISOString().slice(0,10)),JSON.stringify(data.totals||{}),(data.rows||[]).length]);
      }
      res.json({success:true,data});
    } catch(error){res.status(400).json({success:false,message:error.message||"Unable to run custom report"});}
  });

  return router;
}
