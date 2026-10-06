import express from "express";
import { createHash } from "node:crypto";
import { allocateBatchConsumption } from "../services/inventory.js";
import { dispatchIntegrationEvent } from "../services/integrationDispatcher.js";
import { loadSaleLineFeatures, calculateModifierTotal, expandBundleComponents } from "../services/productFeatures.js";
import { getRequestPool } from "../services/tenantDatabase.js";
import { syncCanonicalSaleTransaction } from "../services/canonicalTransactions.js";
import { DEFAULT_PAYMENT_METHODS, getAllowedPaymentMethodCodes, listPaymentMethods } from "../services/paymentMethods.js";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";
import { executeWorkflowActions } from "../services/platformWorkflow.js";
import { evaluateValidationRules } from "../services/platformValidation.js";

export const PAYMENT_METHODS = DEFAULT_PAYMENT_METHODS.map((method) => method.code);

function roundCurrency(value) {
  const numeric = Number(value) || 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function stableRequestValue(value) {
  if (Array.isArray(value)) return value.map(stableRequestValue);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value)
    .filter((key) => !["clientRequestId", "authorization", "card", "paymentToken", "paymentCredentials"].includes(key))
    .sort()
    .reduce((result, key) => {
      result[key] = stableRequestValue(value[key]);
      return result;
    }, {});
}

export function requestFingerprint(payload) {
  return createHash("sha256").update(JSON.stringify(stableRequestValue(payload))).digest("hex");
}

export default function createSalesRouter({
  authenticate,
  authorize,
  db,
  pool,
  associateCustomerWithStore,
  writeAudit = null,
  selfCheckoutMode = null,
  getRolePermissionCodes = null,
  canViewCompanyCustomers = null,
  requestPool = null,
  canonicalTransactionWriter = null,
  connectorDrivers = null,
  savePlatformRecord = null,
}) {
  const router = express.Router();

  async function runConfiguredPaymentFlow(client, req, {
    paymentMode,
    amount,
    cashReceived = 0,
    customerSelected = false,
    hasGiftCardCode = false,
    currency = "GBP",
    clientRequestId = "",
    terminalId = null,
    online = true,
    selfCheckout = false,
    executeConnector = true,
  }) {
    const flowResult = await client.query(
      `SELECT r.action,o.id AS object_id,o.object_key,o.source_table,o.label
         FROM platform_rules r
         JOIN platform_objects o ON o.id=r.object_id
        WHERE o.object_key='sale'
          AND r.active=TRUE
          AND r.lifecycle_status='ACTIVE'
          AND r.action->>'apiName'='ONETILL_PAYMENT_MODE'
          AND (r.company_id IS NULL OR r.company_id=$1)
        ORDER BY CASE WHEN r.company_id=$1 THEN 0 ELSE 1 END,r.updated_at DESC
        LIMIT 1`,
      [req.user.companyId]
    );
    const row = flowResult.rows[0];
    const actions = Array.isArray(row?.action?.actions) ? row.action.actions : [];
    if (!row || !actions.length) {
      const error = new Error("Process Payment Flow is not configured");
      error.code = "PAYMENT_FLOW_UNAVAILABLE";
      error.status = 409;
      throw error;
    }
    const record = {
      paymentMode: String(paymentMode || ""),
      online: online === true,
      customerSelected: customerSelected === true,
      hasGiftCardCode: hasGiftCardCode === true,
      cashReceived: Number(cashReceived || 0),
      total: Number(amount || 0),
      executeConnector: executeConnector === true,
      currency: String(currency || "GBP").toUpperCase(),
      clientRequestId: String(clientRequestId || ""),
      terminalId: terminalId || null,
      selfCheckout: selfCheckout === true,
    };
    const workflowVariables = { variables: {}, steps: {} };
    await executeWorkflowActions({
      actions,
      allActions: actions,
      db: (sql, params = []) => client.query(sql, params),
      req,
      companyId: req.user.companyId,
      object: { id: row.object_id, object_key: row.object_key, source_table: row.source_table, label: row.label },
      record,
      storeId: req.user.storeId || null,
      tillId: terminalId || null,
      connectorDrivers,
      writeAudit,
      actorUserId: req.user.id || null,
      workflowVariables,
    });
    return {
      allowed: workflowVariables.variables.allowed === true,
      selectedPaymentMode: String(workflowVariables.variables.selectedPaymentMode || paymentMode || ""),
      connectorRequired: workflowVariables.variables.connectorRequired === true,
      connectorApproved: workflowVariables.variables.connectorApproved === true,
      connectorPayment: workflowVariables.steps.call_payment_connector || null,
      workflowVariables,
    };
  }

  async function runConfiguredSaleLineFlow(client, req, request) {
    const buttonKey = String(request?.buttonKey || "").trim();
    if (!buttonKey) throw Object.assign(new Error("Sale line Flow button is required"), { status: 400 });
    const result = await client.query(
      `SELECT r.action,o.id AS object_id,o.object_key,o.source_table,o.label
         FROM platform_buttons b JOIN platform_objects o ON o.id=b.object_id
         JOIN platform_rules r ON r.id::text=b.target_key
        WHERE b.button_key=$1 AND b.active=TRUE AND b.target_type='workflow'
          AND r.active=TRUE AND r.lifecycle_status='ACTIVE'
          AND (b.company_id IS NULL OR b.company_id=$2) AND (r.company_id IS NULL OR r.company_id=$2)
        ORDER BY CASE WHEN b.company_id=$2 THEN 0 ELSE 1 END LIMIT 1`,
      [buttonKey, req.user.companyId]
    );
    const row = result.rows[0], actions = Array.isArray(row?.action?.actions) ? row.action.actions : [];
    if (!row || !actions.length) throw Object.assign(new Error("Configured sale line Flow is unavailable"), { status: 409 });
    const workflowVariables = { variables: {}, steps: {} };
    await executeWorkflowActions({
      actions, allActions: actions, db: (sql, params = []) => client.query(sql, params), req,
      companyId: req.user.companyId, object: { id: row.object_id, object_key: row.object_key, source_table: row.source_table, label: row.label },
      record: request?.input && typeof request.input === "object" ? request.input : {},
      storeId: req.user.storeId || null, connectorDrivers, writeAudit, actorUserId: req.user.id || null, workflowVariables,
    });
    const line = workflowVariables.variables;
    const productId = line.productId || null, unitPrice = Number(line.unitPrice), quantity = Number(line.quantity), vatRate = Number(line.vatRate || 0);
    const description = String(line.description || "").trim().slice(0, 255);
    if (!productId || !description || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1)
      throw Object.assign(new Error("Configured sale line Flow returned an invalid line"), { status: 400 });
    const product = await client.query("SELECT id,track_stock FROM products WHERE id=$1 AND company_id=$2 LIMIT 1", [productId, req.user.companyId]);
    if (!product.rows[0] || product.rows[0].track_stock === true) throw Object.assign(new Error("Configured extension sale line must reference a non-stock product"), { status: 400 });
    return { productId, description, unitPrice: roundCurrency(unitPrice), quantity, vatRate };
  }

  function reportDateFilters(query, params, alias = "s") {
    const filters = [];
    if (query.dateFrom) {
      params.push(query.dateFrom);
      filters.push(
        `(${alias}.created_at AT TIME ZONE c.timezone)::date >= $${params.length}`
      );
    }
    if (query.dateTo) {
      params.push(query.dateTo);
      filters.push(
        `(${alias}.created_at AT TIME ZONE c.timezone)::date <= $${params.length}`
      );
    }
    return filters;
  }

  /*
   * GET /api/sales
   */
  router.get(
    "/sales",
    authenticate,
    authorize("sale.view", "sale.create", "sale.refund"),
    async (req, res) => {
      try {
        const params = [req.user.companyId, req.user.storeId];
        const filters = ["s.company_id = $1", "s.store_id = $2"];
        if (req.query.search) {
          params.push(`%${String(req.query.search).trim()}%`);
          filters.push(
            `(s.id::text ILIKE $${params.length} OR s.receipt_number ILIKE $${params.length} OR cst.name ILIKE $${params.length})`
          );
        }
        filters.push(...reportDateFilters(req.query, params));
        if (req.query.paymentMethod) {
          params.push(req.query.paymentMethod);
          filters.push(`pay.payment_method = $${params.length}`);
        }
        if (req.query.status) {
          params.push(req.query.status);
          filters.push(`s.status = $${params.length}`);
        }

        const result = await db(
          `
          SELECT s.id, s.receipt_number, s.created_at, s.store_id, st.name AS store_name,
            COALESCE(cst.name, 'Walk-in Customer') AS customer_name,
            COUNT(DISTINCT si.id)::int AS item_count, s.subtotal, s.tax, s.discount, s.total,
            s.status, u.username AS cashier, pay.payment_method, pay.status AS payment_status
          FROM sales s
          INNER JOIN companies c ON c.id = s.company_id
          LEFT JOIN stores st ON st.id = s.store_id
          LEFT JOIN customers cst ON cst.id = s.customer_id
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN sale_items si ON si.sale_id = s.id
          LEFT JOIN payments pay ON pay.sale_id = s.id
          WHERE ${filters.join(" AND ")}
          GROUP BY s.id, st.name, cst.name, u.username, pay.payment_method, pay.status
          ORDER BY s.created_at DESC
          LIMIT 500
          `,
          params
        );
        res.json({ success: true, data: result.rows });
      } catch (error) {
        console.error("Load sales error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load sales" });
      }
    }
  );

  /*
   * GET /api/sales/:id
   */
  router.get(
    "/sales/:id",
    authenticate,
    authorize("sale.view", "sale.invoice.view", "sale.create", "sale.refund"),
    async (req, res) => {
      try {
        const sale = await db(
          `
          SELECT s.*, st.name AS store_name, st.address_line1, st.address_line2, st.city, st.postcode,
            st.phone AS store_phone, t.name AS terminal_name, u.username AS cashier,
            cst.name AS customer_name, cst.phone AS customer_phone, cst.email AS customer_email,
            pay.payment_method, pay.amount AS payment_amount, pay.status AS payment_status, pay.created_at AS payment_created_at,
            oo.platform, oo.external_order_id
          FROM sales s
          LEFT JOIN online_orders oo ON oo.id = s.online_order_id
            AND oo.company_id = s.company_id AND oo.store_id = s.store_id
          LEFT JOIN stores st ON st.id = s.store_id
          LEFT JOIN terminals t ON t.id = s.terminal_id
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN customers cst ON cst.id = s.customer_id
          LEFT JOIN payments pay ON pay.sale_id = s.id
          WHERE s.id = $1 AND s.company_id = $2 AND s.store_id = $3
          `,
          [req.params.id, req.user.companyId, req.user.storeId]
        );
        if (!sale.rows.length)
          return res
            .status(404)
            .json({ success: false, message: "Sale not found" });
        const items = await db(
          "SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id",
          [req.params.id]
        );
        const returns = await db(
          "SELECT sr.id, sri.product_id, sri.quantity, sr.reason, sr.created_at FROM stock_returns sr INNER JOIN stock_return_items sri ON sri.return_id=sr.id WHERE sr.sale_id=$1 ORDER BY sr.created_at",
          [req.params.id]
        );
        res.json({
          success: true,
          data: { ...sale.rows[0], items: items.rows, returns: returns.rows },
        });
      } catch (error) {
        console.error("Get sale error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load sale" });
      }
    }
  );

  /*
   * POST /api/sales
   */
  /*
   * Legacy POST /api/sales is intentionally retired as a business transaction
   * engine. Sale creation is metadata-owned: clients execute the configured
   * Sale button/Flow through the generic Platform runtime.
   */
  router.post("/sales", authenticate, authorize("sale.create"), (_req, res) => {
    return res.status(410).json({
      success: false,
      code: "METADATA_ACTION_REQUIRED",
      message: "Sale creation is executed through the configured Sale metadata Action/Flow.",
    });
  });

  return router;
}
