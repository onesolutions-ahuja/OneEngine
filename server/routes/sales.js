import express from "express";
import { createHash } from "node:crypto";
import { allocateBatchConsumption } from "../services/inventory.js";
import { normaliseGiftCardCode, isCardRedeemable, validateRedemption } from "../services/giftCards.js";
import { validateRedeemConfig, validateRedeemablePoints } from "../src/utils/loyaltyPoints.js";
import { computeBasketTotals, roundCurrency, resolveEffectivePrice } from "../src/utils/saleTotals.js";
import { dispatchIntegrationEvent } from "../services/integrationDispatcher.js";
import { loadSaleLineFeatures, calculateModifierTotal, expandBundleComponents } from "../services/productFeatures.js";
import { resolvePrice } from "../services/pricingEngine.js";
import { getRequestPool } from "../services/tenantDatabase.js";
import { syncCanonicalSaleTransaction } from "../services/canonicalTransactions.js";
import { DEFAULT_PAYMENT_METHODS, getAllowedPaymentMethodCodes, listPaymentMethods } from "../services/paymentMethods.js";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";
import { evaluateValidationRules } from "../services/platformValidation.js";

export const PAYMENT_METHODS = DEFAULT_PAYMENT_METHODS.map((method) => method.code);

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
  createInventoryMovement,
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
  router.post(
    "/sales",
    authenticate,
    authorize("sale.create"),
    async (req, res) => {
      if (!pool) {
        return res.status(500).json({
          success: false,
          message: "DATABASE_URL is not configured",
        });
      }

      const clientRequestId = req.body.clientRequestId ?? null;
      const clientRequestFingerprint = clientRequestId === null ? null : requestFingerprint(req.body);
      if (clientRequestId !== null && (typeof clientRequestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientRequestId))) {
        return res.status(400).json({ success: false, message: "Invalid clientRequestId UUID" });
      }

      const transactionPool = (typeof requestPool === "function" ? requestPool(req) : null) || req.tenantPool || pool;
      if (!transactionPool) {
        return res.status(503).json({ success: false, code: "TENANT_DATABASE_UNAVAILABLE", message: "Company database is unavailable" });
      }
      const client = await transactionPool.connect();

      try {
        await client.query("BEGIN");
        const db = (query, params = []) => client.query(query, params);

        if (clientRequestId !== null) {
          // Serialize retries before any customer, inventory or payment writes.
          await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
            `${req.user.companyId}:${clientRequestId.toLowerCase()}`,
          ]);
          const existing = await client.query(
            "SELECT id, created_at, total, receipt_number, client_request_fingerprint FROM sales WHERE company_id = $1 AND client_request_id = $2",
            [req.user.companyId, clientRequestId]
          );
          if (existing.rows.length) {
            if (existing.rows[0].client_request_fingerprint && existing.rows[0].client_request_fingerprint !== clientRequestFingerprint) {
              await client.query("ROLLBACK");
              return res.status(409).json({ success: false, code: "IDEMPOTENCY_CONFLICT", message: "Operation ID was already used with a different sale payload" });
            }
            await client.query("COMMIT");
            return res.status(201).json({ success: true, message: "Sale completed", sale: existing.rows[0] });
          }
        }

        const kioskDeviceKey = String(req.body?.kioskDeviceKey || "").trim();
        let kioskContext = null;
        if (kioskDeviceKey) {
          const kiosk = await db(
            `SELECT kd.id AS kiosk_device_id,kd.payment_connector_id,kd.age_approved_until,
                    ic.id AS connector_instance_id,ic.till_id,ic.store_id AS connector_store_id,
                    ic.enabled AS connector_enabled,ic.connection_status,
                    t.terminal_number
               FROM kiosk_devices kd
               JOIN integration_connections ic
                 ON ic.id=kd.payment_connector_id
                AND ic.company_id=kd.company_id
               JOIN terminals t
                 ON t.id=ic.till_id
                AND t.company_id=kd.company_id
                AND t.store_id=kd.store_id
              WHERE kd.company_id=$1
                AND kd.store_id=$2
                AND kd.device_key=$3
                AND kd.active=TRUE
              LIMIT 1`,
            [req.user.companyId, req.user.storeId, kioskDeviceKey]
          );
          kioskContext = kiosk.rows[0] || null;
          if (!kioskContext?.connector_instance_id || !kioskContext?.till_id || kioskContext.connector_enabled !== true) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              success: false,
              code: "KIOSK_PAYMENT_NOT_CONFIGURED",
              message: "This kiosk does not have an active One Connect card machine assigned.",
            });
          }
        }

        let session = kioskContext
          ? await db(
              `SELECT ts.id,ts.terminal_id,t.terminal_number,c.timezone,c.currency
                 FROM till_sessions ts
                 JOIN terminals t ON t.id=ts.terminal_id
                 JOIN stores s ON s.id=ts.store_id
                 JOIN companies c ON c.id=s.company_id
                WHERE ts.company_id=$1
                  AND ts.store_id=$2
                  AND ts.terminal_id=$3
                  AND ts.status='open'
                ORDER BY ts.opened_at DESC
                LIMIT 1`,
              [req.user.companyId, req.user.storeId, kioskContext.till_id]
            )
          : await db(
              `SELECT ts.id, ts.terminal_id, t.terminal_number, c.timezone, c.currency
                 FROM till_sessions ts
                 INNER JOIN terminals t ON t.id = ts.terminal_id
                 INNER JOIN stores s ON s.id = ts.store_id
                 INNER JOIN companies c ON c.id = s.company_id
                WHERE ts.company_id = $1
                  AND ts.store_id = $2
                  AND ts.status = 'open'
                ORDER BY ts.opened_at DESC
                LIMIT 1`,
              [req.user.companyId, req.user.storeId]
            );

        // Public/card-only kiosks own a persistent zero-cash terminal session.
        // It is created only for the exact terminal bound to the kiosk's
        // selected One Connect instance; normal staff Till behaviour is untouched.
        if (kioskContext && !session.rows.length) {
          await db(
            `INSERT INTO till_sessions
               (company_id,terminal_id,store_id,user_id,opening_cash,status,opened_at)
             VALUES($1,$2,$3,$4,0,'open',NOW())
             ON CONFLICT (terminal_id) WHERE status='open' DO NOTHING`,
            [req.user.companyId, kioskContext.till_id, req.user.storeId, req.user.id]
          );
          session = await db(
            `SELECT ts.id,ts.terminal_id,t.terminal_number,c.timezone,c.currency
               FROM till_sessions ts
               JOIN terminals t ON t.id=ts.terminal_id
               JOIN stores s ON s.id=ts.store_id
               JOIN companies c ON c.id=s.company_id
              WHERE ts.company_id=$1 AND ts.store_id=$2
                AND ts.terminal_id=$3 AND ts.status='open'
              LIMIT 1`,
            [req.user.companyId, req.user.storeId, kioskContext.till_id]
          );
        }

        if (!session.rows.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: kioskContext
              ? "The kiosk payment terminal could not start its transaction session."
              : "No open till session. Open a till before selling.",
          });
        }

        const {
          items = [],
          customerId = null,
          paymentMethod = "cash",
          giftCardCode = null,
          ageVerified = false,
          cashReceived = null,
          vatEnabled,
        } = req.body;
        let subtotal = 0;
        let tax = 0;
        let discount = 0;
        let total = 0;

        if (kioskContext && String(paymentMethod || "").toLowerCase() !== "card") {
          await client.query("ROLLBACK");
          return res.status(403).json({
            success: false,
            message: "OneKiosk customer transactions are card-only on this device.",
          });
        }

        let inventoryStoreId = req.user.storeId;
        if (kioskContext && req.body?.kioskFulfilmentStoreId) {
          const fulfilmentStore = await db(
            "SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=TRUE",
            [req.body.kioskFulfilmentStoreId, req.user.companyId]
          );
          if (!fulfilmentStore.rows.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "Selected fulfilment store is unavailable" });
          }
          inventoryStoreId = fulfilmentStore.rows[0].id;
        }

        /*
         * T10D: a Self-Checkout session may only pay by card. The payment
         * contract, sale engine and inventory path are the same as the
         * staff till — only the cash option is removed, and it is removed
         * SERVER-SIDE, not just hidden in the UI.
         */
        if (paymentMethod === "cash" && typeof selfCheckoutMode === "function" && selfCheckoutMode(req)) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            success: false,
            message: "Cash is not accepted at Self-Checkout. Please pay by card.",
          });
        }

        /*
          * T10-DISCOUNT: server-side discount authority.
          *
          * The till client MAY propose per-line and order discounts, but the
          * server is the authority on whether a discount is allowed and how
          * much it is worth. Order discounts require the `sale.discount`
          * permission; without it the proposed order discount is dropped to 0.
          * Authoritative totals are recomputed below from catalogue prices, so
          * a non-privileged till cannot inflate a discount or fabricate prices.
          */
        const isAdmin = typeof canViewCompanyCustomers === "function"
          ? await canViewCompanyCustomers(req.user)
          : false;
        let allowedOrderDiscountType = null;
        let allowedOrderDiscountValue = 0;
        let canOverridePrice = false;
        let roleCodes = [];
        if (typeof getRolePermissionCodes === "function") {
          roleCodes = await getRolePermissionCodes(req.user.roleId);
          const canDiscount = isAdmin || roleCodes.includes("sale.discount");
          if (canDiscount) {
            const dt = req.body.discountType ?? null;
            const dv = Number(req.body.discountValue ?? 0) || 0;
            if ((dt === "percent" || dt === "fixed") && dv > 0) {
              allowedOrderDiscountType = dt;
              allowedOrderDiscountValue = dv;
            }
          }
          canOverridePrice = isAdmin || roleCodes.includes("sale.price_change");
        }

        /*
         * Multiple payment methods — one authoritative tender list.
         *
         * `payments` in the request body is an optional array of
         * { paymentMethod, amount } lines (split tender). When absent, the
         * single `paymentMethod` tender is used exactly as before — cash,
         * card, customer_credit, loyalty redemption and gift-card flows are
         * untouched. Validation rules:
         *   - each line needs a known method and a positive amount;
         *   - methods must not repeat (one row per tender);
         *   - the tender lines must reconcile EXACTLY to the sale total
         *     (pennies) — over/underpayment is rejected. Cash change is a
         *     display concern handled by the till UI, never a split line.
         *   - customer_credit and loyalty redemption are whole-sale tenders:
         *     they may not be mixed with other methods (credit exposes the
         *     full sale amount on the ledger; loyalty redemption already
         *     pre-commit debits its points against the full total).
         */
        const allowedPaymentMethods = await getAllowedPaymentMethodCodes(db, req.user.companyId, { storeId: req.user.storeId, tillId: req.user.tillId });
        const paymentMethodDefinitions = await listPaymentMethods(db, req.user.companyId, { activeOnly: true });
        const paymentMethodByCode = new Map(paymentMethodDefinitions.map((method) => [String(method.code || "").trim(), method]));
        const rawPayments = Array.isArray(req.body.payments) ? req.body.payments : [];
        let paymentLines = rawPayments.length ? rawPayments : null;
        if (!rawPayments.length && paymentMethod === "split") {
          await client.query("ROLLBACK");
          return res.status(400).json({ success: false, message: "Split payment requires a payments array" });
        }

        const saleLineCount = (Array.isArray(items) ? items.length : 0) + (Array.isArray(req.body.miscLines) ? req.body.miscLines.length : 0);
        const saleValidationMeta = await client.query(
          `SELECT o.id AS object_id
             FROM platform_objects o
            WHERE o.object_key='sale'
              AND o.active=TRUE
              AND (o.company_id IS NULL OR o.company_id=$1)
            ORDER BY o.company_id NULLS FIRST
            LIMIT 1`,
          [req.user.companyId]
        );
        if (saleValidationMeta.rows[0]?.object_id) {
          const objectId = saleValidationMeta.rows[0].object_id;
          const [fieldResult, ruleResult] = await Promise.all([
            client.query(
              `SELECT *
                 FROM platform_fields
                WHERE object_id=$1
                  AND active=TRUE
                  AND (company_id IS NULL OR company_id=$2)`,
              [objectId, req.user.companyId]
            ),
            client.query(
              `SELECT *
                 FROM platform_rules
                WHERE object_id=$1
                  AND active=TRUE
                  AND (company_id IS NULL OR company_id=$2)
                  AND trigger_key IN ('before_create','before_save')
                  AND action->>'type'='validation'
                ORDER BY id`,
              [objectId, req.user.companyId]
            ),
          ]);
          const validationErrors = evaluateValidationRules(ruleResult.rows, fieldResult.rows, {
            line_count: saleLineCount,
          });
          if (validationErrors.length) {
            await client.query("ROLLBACK");
            return res.status(422).json({
              success: false,
              code: "VALIDATION_RULE_FAILED",
              message: validationErrors[0].message,
              errors: validationErrors,
            });
          }
        }

        /*
         * T10R: loyalty points redemption (authoritative, pre-commit).
         * Validated against the programme config and the row-locked balance;
         * the debit + REDEEM ledger row commit atomically WITH the sale, so
         * a failed sale never redeems and a committed sale always redeems.
         */
        const redeemPoints = Number(req.body.redeemPoints ?? 0);
        const loyaltyTenderApplied = redeemPoints > 0;
        let loyaltyRedeemValue = 0; // currency value redeemed (0 when none)
        if (redeemPoints > 0) {
          /* Redemption is a whole-sale tender handled by the loyalty ledger
             below (pre-commit debit against the full total) — it can never be
             combined with split payment lines without double-counting money. */
          if (paymentLines) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Loyalty redemption cannot be combined with split payments. Complete the sale with a single payment method.",
            });
          }
          if (!customerId) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "A customer must be selected to redeem loyalty points.",
            });
          }
          const settings = await db(
            `SELECT loyalty_enabled, loyalty_earning_rate, loyalty_min_sale_total, loyalty_redeem_value_per_point, loyalty_min_points_redeem FROM company_settings WHERE company_id = $1`,
            [req.user.companyId]
          );
          const programme = settings.rows[0] ?? null;
          let valuePerPoint = null;
          try {
            ({ valuePerPoint } = validateRedeemConfig(programme));
          } catch (validationError) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: validationError.message });
          }

          // Lock the balance row for the duration of the sale transaction
          const balanceRes = await client.query(
            `SELECT balance FROM customer_loyalty_balances WHERE company_id = $1 AND customer_id = $2 FOR UPDATE`,
            [req.user.companyId, customerId]
          );
          const currentBalance = Number(balanceRes.rows[0]?.balance || 0);
          let pointsToRedeem;
          try {
            pointsToRedeem = validateRedeemablePoints(currentBalance, redeemPoints, programme).points;
          } catch (validationError) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: validationError.message });
          }

          const redeemValue = Math.round(pointsToRedeem * valuePerPoint * 100) / 100;
          loyaltyRedeemValue = redeemValue;
          if (redeemValue > Number(total) + 0.01) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Points redemption exceeds the sale total.",
            });
          }

          const newBalance = currentBalance - pointsToRedeem;
          await client.query(
            `UPDATE customer_loyalty_balances SET balance = $1, updated_at = NOW() WHERE company_id = $2 AND customer_id = $3`,
            [newBalance, req.user.companyId, customerId]
          );
          await client.query(
            `
            INSERT INTO customer_loyalty_transactions
              (company_id, customer_id, transaction_type, amount, balance_after, reference_type, description, created_by)
            VALUES ($1, $2, 'REDEEM', $3, $4, $5, $6, $7)
            `,
            [
              req.user.companyId,
              customerId,
              -pointsToRedeem,
              newBalance,
              "sale",
              `Redeemed at the till (sale total ${Number(total).toFixed(2)})`,
              req.user.id,
            ]
          );
        }

        const payableAfterLoyalty = roundCurrency(Math.max((Number(total) || 0) - Number(loyaltyRedeemValue || 0), 0));
        if (loyaltyTenderApplied && String(paymentMethod || "").toLowerCase() === "loyalty" && payableAfterLoyalty > 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            message: "Selected loyalty points do not cover the full sale. Choose cash or card for the remaining amount.",
          });
        }

        if (customerId) {
          await associateCustomerWithStore(
            client,
            customerId,
            req.user.storeId,
            req.user.companyId,
            new Date()
          );
        }

        /*
         * Till Misc Item (manual-price sale line). Lines the cashier typed by
         * hand — description + price + VAT rate — arrive in `miscLines`. Each
         * is validated HERE (server-side, never trusting the client math),
         * then merged into the authoritative line loop below as
         * item_type='MISC' rows referencing the company's shared invisible
         * MISC placeholder product. No stock movement is made for them (the
         * placeholder has track_stock=false and there is no catalogue SKU to
         * decrement), but they are real sale lines: receipt, sales totals,
         * VAT and reports include them like any other line.
         */
        const miscLines = Array.isArray(req.body.miscLines) ? req.body.miscLines : [];
        const miscPlaceholderRows = [];
        if (miscLines.length) {
          const maxMiscLines = 50;
          if (miscLines.length > maxMiscLines) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Too many misc item lines",
            });
          }

          const placeholder = await client.query(
            `
            INSERT INTO products (
              company_id,
              name,
              sku,
              price,
              cost_price,
              vat_rate,
              vat_applicable,
              track_stock,
              stock_quantity,
              active
            )
            VALUES ($1, 'Misc Item', 'MISC', 0, 0, 20, false, false, 0, false)
            ON CONFLICT (company_id) WHERE sku = 'MISC' AND active = false
            DO UPDATE SET updated_at = NOW()
            RETURNING id
            `,
            [req.user.companyId]
          );
          miscPlaceholderRows.push(placeholder.rows[0].id);
        }
        for (const [miscIndex, line] of miscLines.entries()) {
          const desc = typeof line?.description === "string" ? line.description.trim().slice(0, 255) : "";
          const price = Math.round((Number(line?.price) || 0) * 100) / 100;
          const quantity = Number(line?.quantity);
          const vatRate = Math.round((Number(line?.vatRate) || 0) * 100) / 100;

          if (!desc) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Misc item description is required",
            });
          }
          if (!Number.isFinite(price) || price <= 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Misc item price must be greater than zero",
            });
          }
          if (!Number.isFinite(quantity) || quantity <= 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Misc item quantity must be greater than zero",
            });
          }
          if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 1) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "Misc item VAT rate must be a fraction between 0 and 1 (e.g. 0.2 for 20%)",
            });
          }
        }

        /*
         * Make sure all products belong to this company.
         */
        let basketHasAgeRestricted = false; // T10C
        /*
         * T10U: negative-inventory billing safety. The stock check below is
         * THE existing validation mechanism — it is not replaced. When the
         * company has explicitly enabled negative-inventory billing, an
         * insufficient-stock line is recorded (with authoritative stock
         * levels) and the sale is allowed to proceed into the normal
         * checkout/inventory path instead of being rejected; the resulting
         * negative balance flows through the existing inventory ledger and
         * is audited fire-and-forget after commit. When the setting is OFF
         * (the default) behaviour is exactly as before.
         */
        const negativeBillingAllowed = await client.query(
          "SELECT allow_negative_inventory_billing FROM company_settings WHERE company_id = $1",
          [req.user.companyId]
        ).then((r) => r.rows.length > 0 && r.rows[0].allow_negative_inventory_billing === true);
        const insufficientStockLines = [];
        for (const item of items) {
          if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
            throw new Error("Sale quantities must be greater than zero");
          }

          const product = await client.query(
            `
          SELECT
            id,
            name,
            price,
            stock_quantity,
            track_stock,
            age_restricted
          FROM products
          WHERE id = $1
            AND company_id = $2
            AND active = true
          FOR UPDATE
          `,
            [item.productId, req.user.companyId]
          );

          if (!product.rows.length) {
            throw new Error(`Product ${item.productId} was not found`);
          }

          const p = product.rows[0];
          if (kioskContext && p.track_stock) {
            const storeStock = await client.query(
              `SELECT quantity FROM product_store_stock
                WHERE company_id=$1 AND store_id=$2 AND product_id=$3`,
              [req.user.companyId, inventoryStoreId, item.productId]
            );
            p.stock_quantity = Number(storeStock.rows[0]?.quantity || 0);
          }
          const kind = await client.query(
            `SELECT product_kind FROM products
             WHERE id = $1 AND company_id = $2 AND active = true`,
            [item.productId, req.user.companyId]
          );
          p.product_kind = kind.rows[0]?.product_kind || "standard";

          if (p.age_restricted === true) {
            basketHasAgeRestricted = true;
          }

          if (
            p.track_stock &&
            p.product_kind !== "bundle" &&
            Number(p.stock_quantity) < Number(item.quantity)
          ) {
            /*
             * A paid sale must never be discarded because stock ran out —
             * the money has already changed hands and the sale is the
             * authoritative record. The line is recorded here (with
             * authoritative stock numbers — the client's claim is never
             * trusted) and the sale proceeds into the normal
             * checkout/inventory path: the stock is deducted by the
             * existing SALE inventory movement and the resulting negative
             * balance is audited fire-and-forget after commit. All other
             * validation (quantity, product, price, VAT, permissions,
             * payment) is unchanged.
             */
            insufficientStockLines.push({
              productId: p.id,
              productName: p.name,
              recordedStock: Number(p.stock_quantity) || 0,
              requestedQuantity: Number(item.quantity),
            });
          }
        }

        const stockValidation = await executeSystemWorkflow({
          db,
          companyId: req.user.companyId,
          userId: req.user.id || null,
          systemKey: "flow:till.stock.validate",
          req,
          input: {
            hasShortfall: insufficientStockLines.length > 0,
            allowNegativeStock: negativeBillingAllowed,
          },
          storeId: req.user.storeId || null,
          tillId: session.rows[0].terminal_id || null,
          source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "till.stock.validate" },
        });
        if (stockValidation?.result?.allowed !== true) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            success: false,
            code: "INSUFFICIENT_STOCK",
            message: "Insufficient stock for one or more sale items",
          });
        }

        const kioskAgeApproved = kioskContext
          ? Boolean(kioskContext.age_approved_until && new Date(kioskContext.age_approved_until).getTime() > Date.now())
          : false;
        const ageValidation = await executeSystemWorkflow({
          db,
          companyId: req.user.companyId,
          userId: req.user.id || null,
          systemKey: "flow:till.age.verify",
          req,
          input: {
            requiresAgeVerification: basketHasAgeRestricted,
            ageVerified: kioskContext ? kioskAgeApproved : ageVerified === true,
          },
          storeId: req.user.storeId || null,
          tillId: session.rows[0].terminal_id || null,
          source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "till.age.verify" },
        });
        if (ageValidation?.result?.allowed !== true) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            success: false,
            code: kioskContext ? "KIOSK_AGE_APPROVAL_REQUIRED" : "AGE_VERIFICATION_REQUIRED",
            message: "Age verification required for age-restricted products",
          });
        }

        /*
         * Authoritative receipt number (T8E): sequential per terminal per
         * business day, in the same shape as the offline provisional
         * receipts (PREFIX-YYYYMMDD-NNNN). The advisory lock serialises
         * concurrent numbering for this terminal/day, and MAX(numeric
         * suffix)+1 stays monotonic even if old sale rows are ever
         * removed. Online-order receipts (terminal_id NULL, platform
         * references) never match the LIKE prefix, so they are neither
         * renumbered nor blocked.
         *
         * Configurable prefixes: the company can set per-source invoice
         * prefixes in Settings (till_invoice_prefix / delivery prefix /
         * self_checkout_invoice_prefix, defaults TO / DEL / SC). The prefix
         * is chosen by sale SOURCE: self-checkout mode tokens get the SC
         * prefix, staff till sales get the TO prefix. The sequence stays
         * per terminal per day — the prefix is presentation only, so
         * changing it never resets or collides with existing numbers, and
         * when no prefix is configured the original terminal-number prefix
         * applies unchanged.
         */
        const isSelfCheckoutSale = typeof selfCheckoutMode === "function" && selfCheckoutMode(req);
        let receiptPrefix = (session.rows[0].terminal_number || "T").trim();
        try {
          const prefixSettings = await client.query(
            "SELECT till_invoice_prefix, self_checkout_invoice_prefix FROM company_settings WHERE company_id = $1",
            [req.user.companyId]
          );
          if (prefixSettings.rows.length) {
            const configured = isSelfCheckoutSale
              ? prefixSettings.rows[0].self_checkout_invoice_prefix
              : prefixSettings.rows[0].till_invoice_prefix;
            if (configured && String(configured).trim()) {
              receiptPrefix = String(configured).trim();
            }
          }
        } catch {
          /* Settings row missing/unreadable → original terminal-number prefix. */
        }
        const receiptDateKey = await client.query(
          "SELECT to_char(timezone($1, NOW()), 'YYYYMMDD') AS date_key",
          [session.rows[0].timezone || "UTC"]
        );
        const dateKey = receiptDateKey.rows[0].date_key;

        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
          `${req.user.companyId}:${session.rows[0].terminal_id}:${dateKey}`,
        ]);

        const likePrefix =
          `${receiptPrefix}-${dateKey}-`.replace(/([%_\\])/g, "\\$1") + "%";
        const nextNumberResult = await client.query(
          `
          SELECT COALESCE(MAX(NULLIF(split_part(receipt_number, '-', 3), '')::int), 0) + 1 AS next_number
          FROM sales
          WHERE company_id = $1
            AND terminal_id = $2
            AND receipt_number LIKE $3
          `,
          [req.user.companyId, session.rows[0].terminal_id, likePrefix]
        );
        const receiptNumber = `${receiptPrefix}-${dateKey}-${String(
          nextNumberResult.rows[0].next_number
        ).padStart(4, "0")}`;

        /*
          * T10-DISCOUNT: authoritative totals recomputation.
          *
          * Reads the validated product rows once into a map and recomputes
          * basket totals from authoritative catalogue prices, mirroring
          * src/utils/saleTotals.js semantics: per-line discounts are capped at
          * each line's gross and applied first, then the order discount (only
          * when sale.discount is held) is applied across the discounted basket,
          * then VAT is computed with per-product vat_applicable under the
          * company default rate. The client-proposed subtotal/tax/discount/total
          * are DISCARDED and replaced, so a till cannot inflate prices, apply a
          * discount it lacks permission for, or submit a non-reconciling total.
          */
        const vatRateFromBody = Number(req.body.vatRate ?? 0) || 0;

        /*
         * Resolve the store's metadata-driven Business Division once and use
         * Product Availability related records as the authoritative catalogue
         * scope. A product with no availability rows remains globally sellable
         * for backwards compatibility; once availability rows exist, at least
         * one active row must match this store/division/channel.
         */
        const salesChannel = "till";
        const divisionScope = await client.query(
          `SELECT association.custom_values->>division_field.api_name AS business_division_id,
                  division_object.id AS business_division_object_id
             FROM platform_objects store_object
             JOIN platform_record_associations association
               ON association.object_id=store_object.id
              AND association.record_id=$2
              AND association.company_id=$1
             JOIN platform_fields division_field
               ON division_field.object_id=store_object.id
              AND division_field.api_name='business_division_id'
              AND division_field.active=TRUE
              AND (division_field.company_id IS NULL OR division_field.company_id=$1)
             LEFT JOIN platform_objects division_object
               ON division_object.object_key=division_field.config->>'relatedObjectKey'
              AND division_object.active=TRUE
              AND (division_object.company_id IS NULL OR division_object.company_id=$1)
            WHERE store_object.object_key='store'
              AND store_object.active=TRUE
              AND (store_object.company_id IS NULL OR store_object.company_id=$1)
            ORDER BY (division_field.company_id IS NOT NULL) DESC,
                     (store_object.company_id IS NOT NULL) DESC
            LIMIT 1`,
          [req.user.companyId, req.user.storeId]
        );
        let businessDivisionId = divisionScope.rows[0]?.business_division_id || null;
        let businessDivisionObjectId = divisionScope.rows[0]?.business_division_object_id || null;
        if (!businessDivisionObjectId) businessDivisionId = null;

        const requestedProductIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
        const productPriceMap = {};
        const priceRows = await client.query(
          `
          SELECT p.id, p.price, p.vat_rate, p.vat_applicable, p.category_id,
                 context_price.price AS context_price
          FROM products p
          LEFT JOIN LATERAL (
            SELECT plp.price
              FROM product_availability pa
              JOIN price_list_prices plp
                ON plp.price_list_id=pa.price_list_id
               AND plp.product_id=pa.product_id
             WHERE pa.company_id=p.company_id
               AND pa.product_id=p.id
               AND pa.active=TRUE
               AND (pa.store_id IS NULL OR pa.store_id=$3)
               AND (pa.scope_object_id IS NULL OR pa.scope_object_id=$4)
               AND (pa.scope_record_id IS NULL OR pa.scope_record_id=$5)
               AND pa.channel IN ($6,'all')
             ORDER BY (pa.store_id IS NOT NULL) DESC, pa.priority DESC, pa.updated_at DESC
             LIMIT 1
          ) context_price ON TRUE
          WHERE p.company_id = $1
            AND p.id = ANY($2::uuid[])
            AND p.active = true
            AND (
              NOT EXISTS (
                SELECT 1
                  FROM product_availability pa_any
                 WHERE pa_any.company_id=p.company_id
                   AND pa_any.product_id=p.id
              )
              OR EXISTS (
                SELECT 1
                  FROM product_availability pa
                 WHERE pa.company_id=p.company_id
                   AND pa.product_id=p.id
                   AND pa.active=TRUE
                   AND (pa.store_id IS NULL OR pa.store_id=$3)
                   AND (pa.scope_object_id IS NULL OR pa.scope_object_id=$4)
                   AND (pa.scope_record_id IS NULL OR pa.scope_record_id=$5)
                   AND pa.channel IN ($6,'all')
              )
            )
          `,
          [
            req.user.companyId,
            requestedProductIds,
            req.user.storeId,
            businessDivisionObjectId,
            businessDivisionId,
            salesChannel,
          ]
        );
        for (const row of priceRows.rows) {
          productPriceMap[row.id] = row;
        }
        if (priceRows.rows.length !== requestedProductIds.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            success: false,
            code: "PRODUCT_NOT_AVAILABLE",
            message: "One or more products are not available in this till context.",
          });
        }
        const customerPricing = req.body.customerId
          ? await client.query(
            `SELECT c.price_list_id, cg.price_list_id AS group_price_list_id
               FROM customers c LEFT JOIN customer_groups cg ON cg.id=c.customer_group_id
              WHERE c.id=$1 AND c.company_id=$2`,
            [req.body.customerId, req.user.companyId]
          )
          : { rows: [] };
        const lineFeatures = await loadSaleLineFeatures(client, req.user.companyId, items);

        const basketForTotals = [];
        const saleDiscountAudit = [];
        const salePriceOverride = [];
        for (const item of items) {
          const p = productPriceMap[item.productId];
          const masterPrice = Number(p?.price) || 0;
          const contextPrice = p?.context_price == null ? null : Number(p.context_price);
          const cataloguePrice = contextPrice ?? masterPrice;
          const qty = Number(item.quantity) || 1;
          const features = lineFeatures.get(String(item.productId)) || { modifiers: [] };
          const modifierTotal = calculateModifierTotal(features.modifiers);
          const vatRate = p ? Number(p.vat_rate || 0) / 100 : vatRateFromBody;
          const vatApplicable = p ? p.vat_applicable !== false : true;

          /*
            * T10-PRICE: manual price override. The catalogue price is the
            * default and is used UNLESS the operator holds sale.price_change
            * AND supplies a positive `priceOverride` on the line. Without the
            * permission the client's proposed price is IGNORED — the catalogue
            * price wins, so a user cannot raise or lower the selling price via
            * a crafted request. The override never mutates the product master
            * (only this sale's line is affected); original_unit_price stores
            * the catalogue value for audit/receipts. Decision is delegated to
            * the shared resolveEffectivePrice helper (src/utils/saleTotals.js)
            * so it is unit-tested independently.
            */
          const customer = customerPricing.rows[0];
          const pricingRows = await client.query(
           `SELECT
              (SELECT plp.price FROM price_list_prices plp WHERE plp.product_id=$1 AND plp.price_list_id=$2) AS customer_price,
              (SELECT plp.price FROM price_list_prices plp WHERE plp.product_id=$1 AND plp.price_list_id=$3) AS group_price,
              COALESCE((SELECT json_agg(spp) FROM scheduled_product_prices spp
                WHERE spp.product_id=$1 AND spp.company_id=$4 AND spp.active=true), '[]') AS scheduled_prices,
              COALESCE((SELECT json_agg(pr) FROM promotions pr
                WHERE pr.company_id=$4 AND pr.active=true
                  AND (pr.product_id=$1 OR pr.category_id=$5)), '[]') AS promotions`,
           [item.productId, customer?.price_list_id || null, customer?.group_price_list_id || null,
             req.user.companyId, p?.category_id || null]
          );
          const pricing = pricingRows.rows[0] || {};
          const resolved = resolvePrice({
            basePrice: masterPrice + modifierTotal / qty,
            customerPrice: pricing.customer_price == null ? null : Number(pricing.customer_price),
            groupPrice: pricing.group_price == null ? null : Number(pricing.group_price),
            priceListPrice: contextPrice == null ? null : contextPrice + modifierTotal / qty,
            scheduledPrices: pricing.scheduled_prices || [],
            promotions: pricing.promotions || [],
            quantity: qty,
            at: new Date(),
          });
          const priceResolution = resolveEffectivePrice({
            cataloguePrice: resolved.unitPrice,
            priceOverride: item.priceOverride ?? item.unitPrice,
            canOverridePrice,
          });
          const price = priceResolution.price;
          if (priceResolution.overridden && req.user.id) {
            salePriceOverride.push({
              itemIndex: items.indexOf(item),
              productId: item.productId,
              originalUnitPrice: priceResolution.originalUnitPrice,
              overriddenUnitPrice: price,
              userId: req.user.id,
              reason: typeof item.priceOverrideReason === "string" ? item.priceOverrideReason.trim().slice(0, 255) || null : null,
            });
          }

          const ldt = item.discountType;
          const ldv = Number(item.discountValue ?? 0) || 0;
          const quantityDiscount = roundCurrency(Math.max(0, (price * qty) - resolved.total));
          const requestedDiscount = (ldt === "percent" || ldt === "fixed") && ldv > 0
            ? ldt === "percent"
              ? roundCurrency(Math.min(price * qty, (price * qty) * (ldv / 100)))
              : roundCurrency(Math.min(price * qty, ldv))
            : 0;
          const ld = roundCurrency(Math.min(price * qty, quantityDiscount + requestedDiscount));

          if (requestedDiscount > 0 && item.discountedBy) {
            saleDiscountAudit.push({
              itemIndex: items.indexOf(item),
              discountType: ldt,
              discountValue: ldv,
              amount: requestedDiscount,
              userId: item.discountedBy,
            });
          }

          basketForTotals.push({
            price,
            quantity: qty,
            vatApplicable,
            vatRate: p?.vat_rate ?? null,
            discountType: ld > 0 ? "fixed" : null,
            discountValue: ld,
          });
        }

        /* Index effective prices + original catalogue prices by item index for
         * the sale_items insert below (authoritative, permission-enforced). */
        const effectiveLinePrice = basketForTotals.map((b) => b.price);
        const catalogueLinePrice = items.map((item, idx) => {
          const p = productPriceMap[item.productId];
          const features = lineFeatures.get(String(item.productId)) || { modifiers: [] };
          return (p?.context_price == null ? Number(p?.price) || 0 : Number(p.context_price)) +
            calculateModifierTotal(features.modifiers) / Math.max(Number(item.quantity) || 1, 1);
        });

        // Misc lines participate in the same authoritative totals engine as
        // catalogue products. Their API VAT rate is a fraction (0.2 = 20%),
        // while the shared totals helper accepts a percentage rate per line.
        for (const line of miscLines) {
          basketForTotals.push({
            price: roundCurrency(Number(line.price) || 0),
            quantity: Number(line.quantity) || 0,
            vatApplicable: Number(line.vatRate) > 0,
            vatRate: roundCurrency((Number(line.vatRate) || 0) * 100),
            discountType: null,
            discountValue: 0,
          });
        }

        const engine = computeBasketTotals(basketForTotals, {
          vatEnabled: vatEnabled !== false,
          vatRate: vatRateFromBody,
          discountType: allowedOrderDiscountType,
          discountValue: allowedOrderDiscountValue,
        });

        subtotal = roundCurrency(engine.subtotal);
        tax = roundCurrency(engine.vat || 0);
        discount = roundCurrency(engine.discountAmount);
        total = roundCurrency(engine.total);

        if (paymentLines) {
          const splitValidation = await executeSystemWorkflow({
            db,
            companyId: req.user.companyId,
            userId: req.user.id || null,
            systemKey: "flow:till.split.payment.validate",
            req,
            input: {
              payments: paymentLines.map((line) => ({
                paymentMethod: String(line?.paymentMethod || line?.method || "").trim(),
                amount: Number(line?.amount || 0),
              })),
              total,
              allowedMethodsText: `|${allowedPaymentMethods.join("|")}|`,
            },
            storeId: req.user.storeId || null,
            tillId: session.rows[0].terminal_id || null,
            source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "till.split.payment.validate" },
          });
          if (splitValidation?.result?.allowed !== true) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              code: "SPLIT_PAYMENT_VALIDATION_FAILED",
              message: "Split payment lines must use allowed methods, be unique and positive, and exactly match the sale total.",
              remaining: Number(splitValidation?.result?.remaining || 0),
            });
          }
          paymentLines = paymentLines.map((line) => ({
            method: String(line?.paymentMethod || line?.method || "").trim(),
            amount: roundCurrency(Number(line?.amount || 0)),
          }));
        }

        const selectedPaymentDefinition = paymentMethodByCode.get(String(paymentMethod || "").trim()) || null;
        const selectedPaymentConfig = selectedPaymentDefinition?.config || {};
        const receivedAmount = selectedPaymentConfig.requiresCashReceived === true
          ? Number(cashReceived == null || cashReceived === "" ? total : cashReceived)
          : total;
        const paymentValidation = await executeSystemWorkflow({
          db,
          companyId: req.user.companyId,
          userId: req.user.id || null,
          systemKey: "flow:till.payment.validate",
          req,
          input: {
            paymentMode: String(paymentMethod || ""),
            online: true,
            allowOffline: selectedPaymentDefinition?.allowOffline === true,
            requiresConnector: selectedPaymentDefinition?.requiresConnector === true,
            connectorAvailable: selectedPaymentDefinition?.requiresConnector !== true || Boolean(connectorDrivers),
            requiresCustomer: selectedPaymentConfig.requiresCustomer === true,
            customerSelected: Boolean(customerId),
            requiresGiftCardCode: selectedPaymentConfig.requiresGiftCardCode === true,
            hasGiftCardCode: Boolean(normaliseGiftCardCode(giftCardCode)),
            requiresCashReceived: selectedPaymentConfig.requiresCashReceived === true,
            cashReceived: Number.isFinite(receivedAmount) ? receivedAmount : 0,
            total,
          },
          storeId: req.user.storeId || null,
          tillId: session.rows[0].terminal_id || null,
          source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "till.payment.validate" },
        });
        if (paymentValidation?.result?.allowed !== true) {
          await client.query("ROLLBACK");
          return res.status(400).json({ success: false, code: "PAYMENT_VALIDATION_FAILED", message: "Payment method requirements were not met" });
        }

        let giftCardTender = null;
        if (String(selectedPaymentConfig.handler || "").toLowerCase() === "gift_card") {
          if (paymentLines || !normaliseGiftCardCode(giftCardCode)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: "A gift card code and a single gift card tender are required" });
          }
          const card = await client.query(
            `SELECT * FROM gift_cards WHERE company_id = $1 AND UPPER(REPLACE(REPLACE(code, '-', ''), ' ', '')) = $2 FOR UPDATE`,
            [req.user.companyId, normaliseGiftCardCode(giftCardCode)]
          );
          const eligibility = isCardRedeemable(card.rows[0]);
          if (!eligibility.ok) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: eligibility.reason });
          }
          const balance = await client.query(
            `SELECT COALESCE(SUM(CASE transaction_type WHEN 'redeem' THEN -amount ELSE amount END), 0) AS balance
             FROM gift_card_transactions WHERE gift_card_id = $1 AND company_id = $2`,
            [card.rows[0].id, req.user.companyId]
          );
          const redemption = validateRedemption(balance.rows[0]?.balance, total);
          if (!redemption.ok) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: redemption.reason });
          }
          giftCardTender = { id: card.rows[0].id, balance: Number(balance.rows[0]?.balance) || 0 };
        }

        if (allowedOrderDiscountType && engine.orderDiscount > 0 && req.user.id) {
          saleDiscountAudit.push({
            itemIndex: null,
            discountType: allowedOrderDiscountType,
            discountValue: allowedOrderDiscountValue,
            amount: roundCurrency(engine.orderDiscount),
            userId: req.user.id,
          });
        }

        const connectorPayments = new Map();
        const connectorTenders = paymentLines
          ? paymentLines.filter((line) => paymentMethodByCode.get(String(line.method || ""))?.requiresConnector === true)
          : selectedPaymentDefinition?.requiresConnector === true && payableAfterLoyalty > 0
            ? [{ method: String(paymentMethod || ""), amount: payableAfterLoyalty }]
            : [];

        for (const tender of connectorTenders) {
          const methodCode = String(tender.method || "").trim();
          const methodDefinition = paymentMethodByCode.get(methodCode);
          const amount = roundCurrency(Number(tender.amount || 0));
          if (!methodDefinition || amount <= 0) continue;
          if (!clientRequestId) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              code: "IDEMPOTENCY_REQUIRED",
              message: `${methodDefinition.label || methodCode} payments require a stable clientRequestId`,
            });
          }
          if (!connectorDrivers) {
            await client.query("ROLLBACK");
            return res.status(503).json({
              success: false,
              code: "CONNECTOR_UNAVAILABLE",
              message: `${methodDefinition.label || methodCode} payment connector is unavailable`,
            });
          }

          const configuredPackageKey = String(methodDefinition?.config?.connectorPackageKey || "").trim();
          let connectorInstanceId = kioskContext?.connector_instance_id || null;
          if (!connectorInstanceId && configuredPackageKey) {
            const instance = await client.query(
              `SELECT id
                 FROM integration_connections
                WHERE company_id=$1
                  AND connector_package_key=$2
                  AND enabled=TRUE
                  AND UPPER(COALESCE(connection_status,''))='CONNECTED'
                  AND (store_id IS NULL OR store_id=$3)
                  AND (till_id IS NULL OR till_id=$4)
                ORDER BY (till_id IS NOT NULL) DESC,(store_id IS NOT NULL) DESC,fallback_order ASC,updated_at DESC
                LIMIT 1`,
              [req.user.companyId, configuredPackageKey, req.user.storeId, session.rows[0].terminal_id]
            );
            connectorInstanceId = instance.rows[0]?.id || null;
            if (!connectorInstanceId) {
              await client.query("ROLLBACK");
              return res.status(503).json({
                success: false,
                code: "CONNECTOR_UNAVAILABLE",
                message: `${methodDefinition.label || methodCode} connector is not configured and available for this till`,
              });
            }
          }

          const idempotencyKey = `${req.user.companyId}:${clientRequestId.toLowerCase()}:payment.${methodCode}`;
          const paymentExecution = await executeSystemWorkflow({
            db,
            companyId: req.user.companyId,
            userId: req.user.id || null,
            systemKey: "action:PAYMENT_START",
            req,
            input: {
              amount,
              currency: String(session.rows[0]?.currency || "GBP").toUpperCase(),
              idempotencyKey,
              reference: clientRequestId,
              terminalId: session.rows[0].terminal_id,
              paymentMode: methodCode,
              connectorInstanceId,
              selfCheckout: typeof selfCheckoutMode === "function" && selfCheckoutMode(req),
            },
            storeId: req.user.storeId,
            tillId: session.rows[0].terminal_id,
            connectorDrivers,
            writeAudit,
            source: {
              type: "api",
              method: req.method,
              path: req.originalUrl || req.path,
              capability: "payment.sale",
              connectorInstanceId,
              paymentMode: methodCode,
              appName: kioskContext ? "OneKiosk" : null,
            },
          });

          const workflowPayment = paymentExecution.result || {};
          const connectorPayment = workflowPayment.success === true
            ? { available: true, ...workflowPayment, workflowRunId: paymentExecution.runId }
            : { available: false, ...workflowPayment, workflowRunId: paymentExecution.runId };
          const paymentResult = connectorPayment.result;
          const code = paymentResult?.status || connectorPayment.code || "CONNECTOR_UNAVAILABLE";
          if (!connectorPayment.available || paymentResult?.status !== "APPROVED") {
            await client.query("ROLLBACK");
            const statusCode = code === "DECLINED" ? 402 : code === "TIMEOUT" ? 504 : 503;
            await writeAudit?.(req.user.companyId, req.user.id, "payment.connector.failed", "connector", connectorPayment.connectorInstanceId || connectorInstanceId || null, {
              paymentMode: methodCode,
              code,
              amount,
              clientRequestId,
            });
            return res.status(statusCode).json({
              success: false,
              code,
              message: code === "DECLINED"
                ? `${methodDefinition.label || methodCode} payment was declined`
                : `${methodDefinition.label || methodCode} payment could not be confirmed`,
            });
          }

          connectorPayments.set(methodCode, {
            ...connectorPayment,
            idempotencyKey,
          });
          await writeAudit?.(req.user.companyId, req.user.id, "payment.connector.approved", "connector", connectorPayment.connectorInstanceId || connectorInstanceId || null, {
            paymentMode: methodCode,
            amount,
            providerTransactionId: paymentResult?.providerTransactionId || null,
            terminalId: paymentResult?.terminalId || null,
            clientRequestId,
          });
        }

        /*
         * Create sale.
         */
        /* T10R: bound (was inline 'completed') so the loyalty earn guard
         * reads a real status; only earnable statuses award points. */
        const saleStatus = "completed";
        const sale = await client.query(
          `
          INSERT INTO sales (
            company_id,
            store_id,
            user_id,
            customer_id,
            terminal_id,
            receipt_number,
            subtotal,
            tax,
            discount,
            total,
            cash_received,
            line_count,
            status,
            offline_created,
            sync_status,
            client_request_id,
            client_request_fingerprint,
            completed_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$14,$15,
            $12,
            false,
            'synced',
            $11,
            $13,
            NOW()
          )
          RETURNING
            id,
            created_at,
            total,
            cash_received,
            receipt_number
          `,
          [
            req.user.companyId,
            req.user.storeId,
            req.user.id,
            customerId,
            session.rows[0].terminal_id,
            receiptNumber,
            Number(subtotal) || 0,
            Number(tax) || 0,
            Number(discount) || 0,
            Number(total) || 0,
            clientRequestId,
            clientRequestFingerprint,
            saleStatus,
            selectedPaymentConfig.requiresCashReceived === true ? (Number.isFinite(receivedAmount) ? receivedAmount : Number(total) || 0) : null,
            saleLineCount,
          ]
        );

        const saleId = sale.rows[0].id;

        /*
         * Sale items + stock reduction. Misc lines are appended to the same
         * insert as ordinary lines, but flagged item_type='MISC' and never
         * stock-decremented (no catalogue SKU exists to decrement).
          */
          const saleItemIds = [];
          for (const [itemIndex, item] of items.entries()) {
          const product = await client.query(
            `
          SELECT
            id,
            name,
            price,
            vat_rate,
            track_stock
          FROM products
          WHERE id = $1
            AND company_id = $2
            AND active = true
          `,
            [item.productId, req.user.companyId]
          );

          const p = product.rows[0];
          if (!p) {
            throw Object.assign(new Error(`Product ${item.productId} was not found`), { statusCode: 400 });
          }
          const batch = await client.query(
            `SELECT batch_tracking
             FROM products
             WHERE id = $1 AND company_id = $2 AND active = true`,
            [item.productId, req.user.companyId]
          );
          p.batch_tracking = batch.rows[0]?.batch_tracking === true;
          const features = lineFeatures.get(String(item.productId)) || { modifiers: [], bundleComponents: [] };
          const stockLines = features.bundleComponents.length
            ? expandBundleComponents(item.quantity, features.bundleComponents)
            : p.track_stock
              ? [{ productId: item.productId, quantity: Number(item.quantity) || 1 }]
              : [];
          for (const modifier of features.modifiers) {
            if (modifier.trackStock && modifier.inventoryProductId) {
              stockLines.push({
                productId: modifier.inventoryProductId,
                quantity: modifier.quantity * (Number(item.quantity) || 1),
              });
            }
          }
          for (const stockLine of stockLines) {
            const movement = await createInventoryMovement(client, {
              companyId: req.user.companyId,
              productId: stockLine.productId,
              storeId: inventoryStoreId,
              movementType: "SALE",
              quantityChange: -stockLine.quantity,
              referenceType: "SALE",
              referenceId: saleId,
              createdBy: req.user.id,
            });

            if (stockLine.productId === item.productId) p.stock_quantity = movement.balance;

            /*
             * Batch / expiry tracking: keep this store's batch rows in step
             * with the sale. Only products flagged batch_tracking allocate
             * (no-op otherwise — zero extra queries); allocation is FEFO
             * (First Expired, First Out). The authoritative stock deduction
             * is the movement above; this only moves the batch bookkeeping
             * so the ledger and the batches can never disagree. Same
             * transaction — sale failure rolls both back together.
             */
            if (p.batch_tracking && stockLine.productId === item.productId) {
              await allocateBatchConsumption(client, {
                companyId: req.user.companyId,
                storeId: inventoryStoreId,
                productId: item.productId,
                quantity: stockLine.quantity,
                mode: "fefo",
              });
            }
          }

          const itemInsert = await client.query(
            `
          INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            discount,
            tax,
            total,
            item_type,
            discount_type,
            discount_value,
            original_unit_price,
            original_tax,
            original_total,
            discounted_by,
            modifier_data,
            bundle_components
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PRODUCT',$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb)
          RETURNING id
          `,
             [
               saleId,
               item.productId,
               p.name,
               Number(item.quantity) || 1,
               effectiveLinePrice[itemIndex],
               Number(item.discount) || 0,
               Number(item.tax) || 0,
               Number(item.total) || 0,
               item.discountType || null,
               Number(item.discountValue) || 0,
               catalogueLinePrice[itemIndex],
               Number(p.vat_rate || 0) / 100,
               roundCurrency(effectiveLinePrice[itemIndex] * (Number(item.quantity) || 1)),
               item.discountedBy || null,
               JSON.stringify(features.modifiers),
               JSON.stringify(features.bundleComponents),
             ]
           );
          const saleItemId = itemInsert?.rows?.[0]?.id || null;
          saleItemIds.push(saleItemId);
          for (const modifier of features.modifiers) {
            if (!saleItemId) continue;
            await client.query(
              `INSERT INTO sale_item_modifiers
                (sale_item_id, modifier_option_id, quantity, unit_price, total)
               VALUES ($1,$2,$3,$4,$5)`,
              [saleItemId, modifier.optionId, modifier.quantity, modifier.price,
                roundCurrency(modifier.quantity * modifier.price)]
            );
          }
        }

        /*
         * Misc lines: same sale_items table, real money values (the client's
         * maths is never trusted — price/tax are recomputed from the
         * validated description/quantity/vatRate), flagged item_type='MISC',
         * referencing the shared placeholder. No stock movement.
         */
        for (const line of miscLines) {
          const desc = typeof line.description === "string" ? line.description.trim().slice(0, 255) : "";
          const price = Math.round((Number(line.price) || 0) * 100) / 100;
          const quantity = Number(line.quantity);
          const vatRate = Math.round((Number(line.vatRate) || 0) * 100) / 100;
          const gross = Math.round(price * quantity * 100) / 100;
          const lineTax = vatEnabled === false ? 0 : Math.round(gross * vatRate * 100) / 100;
          const lineTotal = Math.round((gross + lineTax) * 100) / 100;

          await client.query(
            `
          INSERT INTO sale_items (
            sale_id,
            product_id,
            product_name,
            quantity,
            unit_price,
            discount,
            tax,
            total,
            item_type
          )
          VALUES ($1,$2,$3,$4,$5,0,$6,$7,'MISC')
          `,
            [
              saleId,
              miscPlaceholderRows[0],
              desc,
              quantity,
              price,
              lineTax,
              lineTotal,
            ]
           );
         }

         /*
          * T10-DISCOUNT: audit trail for every discount applied to this sale.
          * Per-line entries reference the sale_items row; order-level entries
          * have item_id NULL. Persisted atomically with the sale.
          */
          for (const entry of saleDiscountAudit) {
            const itemId = entry.itemIndex != null ? saleItemIds[entry.itemIndex] : null;
            await client.query(
              `
              INSERT INTO sale_discounts
                (sale_id, item_id, user_id, type, value, amount)
              VALUES ($1, $2, $3, $4, $5, $6)
              `,
              [saleId, itemId || null, entry.userId, entry.discountType, entry.discountValue, entry.amount]
            );
          }

          /*
           * T10-PRICE: audit trail for manual price overrides (sale.price_change).
           * Persisted atomically with the sale; links the sale, sale_item and
           * product with the original and overridden unit prices and the actor.
           */
          for (const entry of salePriceOverride) {
            const itemId = entry.itemIndex != null ? saleItemIds[entry.itemIndex] : null;
            await client.query(
              `
              INSERT INTO sale_price_overrides
                (sale_id, item_id, product_id, user_id, original_unit_price, overridden_unit_price, reason)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              `,
              [saleId, itemId, entry.productId, entry.userId, entry.originalUnitPrice, entry.overriddenUnitPrice, entry.reason]
            );
          }


        /*
          * Payment records — one row per tender.
         *
         * With a validated split (`payments` array) every line is persisted
         * with its own method and amount (reconciliation already enforced
         * above). Without one, the historic single tender is written exactly
         * as before: loyalty redemption relabels the row "loyalty" (the
         * redemption debit lives in the loyalty ledger), and credit/other
         * methods pass through unchanged.
         */
        const tenderRows = paymentLines
          ? paymentLines.map((line) => [saleId, line.method, line.amount])
          : loyaltyTenderApplied
            ? [
                [saleId, "loyalty", roundCurrency(loyaltyRedeemValue)],
                ...(payableAfterLoyalty > 0 ? [[saleId, paymentMethod, payableAfterLoyalty]] : []),
              ]
            : [[saleId, paymentMethod, Number(total) || 0]];
        for (const [tSaleId, tMethod, tAmount] of tenderRows) {
          const connectorPayment = connectorPayments.get(String(tMethod || "")) || null;
          const paymentResult = connectorPayment?.result?.status === "APPROVED" ? connectorPayment.result : null;
          await client.query(
            `
            INSERT INTO payments (
              sale_id,
              payment_method,
              amount,
              status,
              provider,
              terminal_id,
              provider_transaction_id,
              idempotency_key
            )
            VALUES ($1,$2,$3,'completed',$4,$5,$6,$7)
            `,
            [
              tSaleId,
              tMethod,
              tAmount,
              paymentResult ? connectorPayment.connectorPackageKey : null,
              paymentResult?.terminalId || (paymentResult ? session.rows[0].terminal_id : null),
              paymentResult?.providerTransactionId || null,
              paymentResult ? connectorPayment.idempotencyKey : null,
            ]
          );
        }

        if (giftCardTender) {
          await client.query(
            `INSERT INTO gift_card_transactions
              (company_id, gift_card_id, transaction_type, amount, balance_after, reference_type, reference_id, description, store_id, created_by)
             VALUES ($1, $2, 'redeem', $3, $4 - $3, 'sale', $5, 'Gift card sale', $6, $7)
             ON CONFLICT DO NOTHING RETURNING balance_after`,
            [req.user.companyId, giftCardTender.id, total, giftCardTender.balance, saleId, req.user.storeId, req.user.id]
          );
          await client.query(
            `UPDATE payments SET provider_transaction_id = $1 WHERE sale_id = $2 AND payment_method = $3`,
            [`giftcard:${giftCardTender.id}`, saleId, "gift_card"]
          );
        }

        /*
         * T10Y — Customer credit sale. Runs INSIDE the sale transaction so
         * the ledger entry commits or rolls back with the sale itself.
         * Cash/card/other flows are untouched. `amount` stores the unsigned
         * magnitude (major units); the direction comes from transaction_type.
         */
        if (paymentMethod === "customer_credit") {
          if (!customerId) {
            await client.query("ROLLBACK");
            return res.status(400).json({
              success: false,
              message: "A customer is required for credit sales",
            });
          }

          const creditCustomer = await client.query(
            `SELECT credit_enabled, credit_limit, maximum_credit_age_days FROM customers WHERE id = $1 AND company_id = $2 FOR UPDATE`,
            [customerId, req.user.companyId]
          );
          if (!creditCustomer.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: "Customer was not found" });
          }
          const cc = creditCustomer.rows[0];
          if (cc.credit_enabled !== true) {
            await client.query("ROLLBACK");
            return res.status(409).json({
              success: false,
              message: "Customer credit is not enabled for this customer",
            });
          }

          const saleTotalCents = Math.round((Number(total) || 0) * 100);
          const signedSum = await client.query(
            `
            SELECT COALESCE(SUM(amount * CASE WHEN transaction_type IN ('payment','debit_note') THEN -1 ELSE 1 END), 0) AS outstanding
            FROM customer_credit_ledger
            WHERE company_id = $1 AND customer_id = $2
            `,
            [req.user.companyId, customerId]
          );
          const currentOutstandingCents = Math.round(Number(signedSum.rows[0].outstanding || 0) * 100);
          const limitCents = Math.round((Number(cc.credit_limit) || 0) * 100);
          let limitExecution;
          try {
            limitExecution = await executeSystemWorkflow({
              db,
              companyId: req.user.companyId,
              userId: req.user.id || null,
              systemKey: "flow:customer.credit.limit.check",
              req,
              storeId: req.user.storeId || null,
              input: {
                currentBalanceCents: currentOutstandingCents,
                saleAmountCents: saleTotalCents,
                creditLimitCents: cc.credit_limit == null ? null : limitCents,
              },
              source: {
                type: "api",
                method: req.method,
                path: req.originalUrl || req.path,
                capability: "customer.credit.limit.check",
              },
            });
          } catch (error) {
            if (error?.code !== "CUSTOM_FLOW_ERROR") throw error;
            await client.query("ROLLBACK");
            return res.status(409).json({
              success: false,
              message: error.message || "Customer credit limit Flow blocked this sale",
            });
          }
          if (limitExecution?.status !== "COMPLETED") {
            await client.query("ROLLBACK");
            return res.status(503).json({
              success: false,
              message: "Customer credit limit Flow did not complete",
            });
          }
          const limitCheck = limitExecution?.result;
          const allowed = typeof limitCheck?.allowed === "boolean"
            ? limitCheck.allowed
            : limitCheck?.variableName === "allowed" && typeof limitCheck.value === "boolean"
              ? limitCheck.value
              : null;
          if (allowed !== true) {
            await client.query("ROLLBACK");
            if (allowed !== false) {
              return res.status(503).json({
                success: false,
                message: "Customer credit limit Flow did not return a valid decision",
              });
            }
            const availableCreditCents = Number.isFinite(Number(limitCheck.availableCreditCents))
              ? Number(limitCheck.availableCreditCents)
              : limitCents - currentOutstandingCents;
            return res.status(409).json({
              success: false,
              message: `Credit limit exceeded. Available credit: £${(availableCreditCents / 100).toFixed(2)}`,
            });
          }

          const transactionExecution = await executeSystemWorkflow({
            db,
            companyId: req.user.companyId,
            userId: req.user.id || null,
            systemKey: "flow:customer.credit.transaction.build_sale",
            req,
            storeId: req.user.storeId || null,
            input: {
              saleId,
              customerId,
              companyId: req.user.companyId,
              storeId: req.user.storeId,
              amount: Number(total) || 0,
              totalTax: Number(tax) || 0,
              netAmount: Number(subtotal) || 0,
              grossAmount: Number(total) || 0,
              userId: req.user.id,
              receiptNumber: sale.rows[0].receipt_number,
            },
            source: {
              type: "api",
              method: req.method,
              path: req.originalUrl || req.path,
              capability: "customer.credit.transaction.build_sale",
            },
          });
          if (transactionExecution?.status !== "COMPLETED") {
            await client.query("ROLLBACK");
            return res.status(503).json({
              success: false,
              message: "Customer credit sale Flow did not complete",
            });
          }
          const ledgerTx = transactionExecution?.result?.transaction;
          const expectedAmount = Math.round((Number(total) || 0) * 100);
          const validLedgerTx = ledgerTx
            && ledgerTx.transaction_type === "credit_sale"
            && String(ledgerTx.company_id) === String(req.user.companyId)
            && String(ledgerTx.customer_id) === String(customerId)
            && ledgerTx.reference_type === "sale"
            && String(ledgerTx.reference_id) === String(saleId)
            && String(ledgerTx.store_id || "") === String(req.user.storeId || "")
            && String(ledgerTx.created_by || "") === String(req.user.id || "")
            && Math.round(Number(ledgerTx.amount) * 100) === expectedAmount
            && Math.round(Number(ledgerTx.net_amount) * 100) === Math.round((Number(subtotal) || 0) * 100)
            && Math.round(Number(ledgerTx.vat_amount) * 100) === Math.round((Number(tax) || 0) * 100)
            && Math.round(Number(ledgerTx.gross_amount) * 100) === expectedAmount;
          if (!validLedgerTx) {
            await client.query("ROLLBACK");
            return res.status(503).json({
              success: false,
              message: "Customer credit sale Flow did not return a valid ledger transaction",
            });
          }
          await client.query(
            `
            INSERT INTO customer_credit_ledger
              (company_id, store_id, customer_id, transaction_type, amount, reference_type, reference_id, description, net_amount, vat_amount, gross_amount, idempotency_key, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            `,
            [
              ledgerTx.company_id,
              ledgerTx.store_id,
              ledgerTx.customer_id,
              ledgerTx.transaction_type,
              ledgerTx.amount,
              ledgerTx.reference_type,
              ledgerTx.reference_id,
              ledgerTx.description,
              ledgerTx.net_amount,
              ledgerTx.vat_amount,
              ledgerTx.gross_amount,
              clientRequestId ? `credit_sale:${clientRequestId.toLowerCase()}` : null,
              ledgerTx.created_by,
            ]
          );
        }

        if (typeof canonicalTransactionWriter === "function") {
          await canonicalTransactionWriter(client, {
            saleId,
            companyId: req.user.companyId,
            storeId: req.user.storeId,
            transactionType: "SALE",
          });
        }

        /*
         * Platform record lifecycle hook. This keeps the protected Sales
         * transaction authoritative while exposing the completed Sale record
         * to metadata validation, after-create rules and workflow actions.
         * Communication timing now belongs to Sale workflows rather than
         * hard-coded WhatsApp/SMS/Email calls in this route.
         */
        if (typeof savePlatformRecord === "function") {
          const platformSale = await client.query(
            "SELECT * FROM sales WHERE id=$1 AND company_id=$2 AND store_id=$3",
            [saleId, req.user.companyId, req.user.storeId]
          );
          if (platformSale.rows[0]) {
            await savePlatformRecord({
              db,
              key: "sale",
              req,
              record: platformSale.rows[0],
              previous: null,
            });
          }
        }

        await client.query("COMMIT");

        if (kioskContext && basketHasAgeRestricted) {
          await db(
            `UPDATE kiosk_devices
                SET age_approved_until=NULL,age_approved_by=NULL,age_approval_requested_at=NULL,updated_at=NOW()
              WHERE id=$1 AND company_id=$2`,
            [kioskContext.kiosk_device_id, req.user.companyId]
          );
          await writeAudit?.(req.user.companyId, req.user.id || null, "KIOSK_AGE_APPROVAL_CONSUMED", "kiosk_device", kioskContext.kiosk_device_id, {});
        }

        /*
         * T10R: Customer loyalty earning - fire-and-forget after sale commit
         * Loyalty failures must never block a completed sale. The earn base
         * excludes any redemption applied to this sale (a customer never
         * earns points on points). Redemption itself is handled pre-commit
         * above, atomically with the sale.
         */
        const loyaltyEarnBase = loyaltyTenderApplied ? Math.max(Number(total) - Number(loyaltyRedeemValue), 0) : Number(total);
        if (customerId && typeof writeAudit === "function") {
          Promise.resolve(
            (async () => {
              try {
                // Check if loyalty is enabled for this company
                const settings = await db(
                  `SELECT loyalty_enabled, loyalty_earning_rate, loyalty_min_sale_total FROM company_settings WHERE company_id = $1`,
                  [req.user.companyId]
                );
                if (!settings.rows.length || !settings.rows[0].loyalty_enabled) return;

                /* Cancelled/void sales must never award points. The earn
                 * block runs after the sale transaction commits, so the
                 * sale's CURRENT status is re-read from the database —
                 * a sale voided between commit and this block (or created
                 * by a flow that must not award) is skipped here. */
                const earnableStatuses = ["completed", "paid", "partially_paid"];
                const saleStatusRow = await db(
                  `SELECT status FROM sales WHERE id = $1 AND company_id = $2`,
                  [saleId, req.user.companyId]
                );
                if (
                  !saleStatusRow.rows.length ||
                  !earnableStatuses.includes(String(saleStatusRow.rows[0].status).toLowerCase())
                )
                  return;

                const earningRate = Number(settings.rows[0].loyalty_earning_rate) || 0.01;
                const minSaleTotal = settings.rows[0].loyalty_min_sale_total;
                if (minSaleTotal !== null && minSaleTotal !== undefined && loyaltyEarnBase < Number(minSaleTotal)) return;

                const loyaltyEarned = Math.round(loyaltyEarnBase * earningRate * 10000) / 10000;

                if (loyaltyEarned <= 0) return;

                /* T10R idempotent earn: the unique index
                 * uq_loyalty_earn_per_sale makes a second EARN for the same
                 * sale impossible (lost-acknowledgement retry / double
                 * fire). If the insert hits 23505 the balance upsert is
                 * reversed so the stored balance stays ledger-true. */
                let balanceAfter;
                try {
                  // Insert/update loyalty balance (upsert) and get new balance
                  const balanceResult = await db(
                    `
                    INSERT INTO customer_loyalty_balances (company_id, customer_id, balance)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (company_id, customer_id) 
                    DO UPDATE SET balance = customer_loyalty_balances.balance + EXCLUDED.balance,
                                   updated_at = NOW()
                    RETURNING balance
                    `,
                    [req.user.companyId, customerId, loyaltyEarned]
                  );

                  balanceAfter = Number(balanceResult.rows[0].balance);

                  // Record transaction
                  await db(
                    `
                    INSERT INTO customer_loyalty_transactions 
                      (company_id, customer_id, transaction_type, amount, balance_after, reference_type, reference_id, description, created_by)
                    VALUES ($1, $2, 'EARN', $3, $4, 'sale', $5, 'Sale completed', $6)
                    `,
                    [req.user.companyId, customerId, loyaltyEarned, balanceAfter, saleId, req.user.id]
                  );
                } catch (earnError) {
                  if (earnError && earnError.code === "23505") {
                    /* Already earned for this sale - reverse the balance
                     * upsert so it matches the ledger, then finish quietly. */
                    try {
                      await db(
                        `UPDATE customer_loyalty_balances SET balance = balance - $3, updated_at = NOW() WHERE company_id = $1 AND customer_id = $2`,
                        [req.user.companyId, customerId, loyaltyEarned]
                      );
                    } catch (revertError) {
                      console.error("Loyalty balance revert error:", revertError);
                    }
                    return;
                  }
                  throw earnError;
                }

                // Audit log for loyalty earning
                writeAudit(
                  req.user.companyId,
                  req.user.id,
                  "loyalty.earned",
                  "customer",
                  customerId,
                  { saleId, amount: loyaltyEarned, balanceAfter }
                ).catch((auditError) => console.error("Loyalty audit write error:", auditError));
              } catch (loyaltyError) {
                console.error("Loyalty earning error:", loyaltyError);
                // Do not throw - loyalty failures must not block sales
              }
            })()
          ).catch(() => {});
        }

        /*
         * T10C audit trail: one minimal verification event per restricted
         * sale (sale ID, store, operator, timestamp, confirmed — no personal
         * data). Fire-and-forget through the SHARED audit writer after the
         * sale has committed, so an audit failure can never block or fail a
         * legitimate verified sale (same policy as every other audit write).
         */
        if (basketHasAgeRestricted && typeof writeAudit === "function") {
          Promise.resolve(
            writeAudit(
              req.user.companyId,
              req.user.id,
              "SALE_AGE_VERIFIED",
              "sale",
              saleId,
              { verified: true, storeId: req.user.storeId ?? null }
            )
          ).catch((auditError) => console.error("Age-verification audit write error:", auditError));
        }

        /*
         * T10U audit trail: one event per sale completed despite insufficient
         * stock. Captures product, requested quantity, recorded stock before
         * the sale, resulting stock after the existing SALE ledger movement,
         * operator, store and the sale reference. Fire-and-forget through the
         * shared audit writer — an audit failure can never fail the sale.
         */
        if (insufficientStockLines.length && typeof writeAudit === "function") {
          Promise.resolve(
            (async () => {
              const resulting = new Map();
              for (const line of insufficientStockLines) {
                try {
                  const bal = await db(
                    `SELECT stock_quantity FROM products WHERE id = $1 AND company_id = $2`,
                    [line.productId, req.user.companyId]
                  );
                  resulting.set(String(line.productId), bal.rows.length ? Number(bal.rows[0].stock_quantity) : null);
                } catch {
                  resulting.set(String(line.productId), null);
                }
              }
              return writeAudit(
                req.user.companyId,
                req.user.id,
                "SALE_NEGATIVE_STOCK",
                "sale",
                saleId,
                {
                  receiptNumber: receiptNumber,
                  storeId: req.user.storeId ?? null,
                  lines: insufficientStockLines.map((line) => ({
                    productId: line.productId,
                    productName: line.productName,
                    requestedQuantity: line.requestedQuantity,
                    recordedStock: line.recordedStock,
                    resultingStock: resulting.get(String(line.productId)),
                  })),
                }
              );
            })()
          ).catch((auditError) => console.error("Negative-stock audit write error:", auditError));
        }

        /*
         * T9G: fire-and-forget integration dispatch (never blocks/throws -
         * partner failures cannot affect the completed sale).
         */
        dispatchIntegrationEvent({
          event: "SALE_CREATED",
          deps: { db },
          context: { companyId: req.user.companyId, storeId: req.user.storeId },
          entityId: saleId,
        }).catch(() => {});

        res.status(201).json({
          success: true,
          message: "Sale completed",
          sale: sale.rows[0],
        });
      } catch (error) {
        await client.query("ROLLBACK");

        console.error("Sale error:", error);

        res.status(500).json({
          success: false,
          message: error.message || "Sale could not be completed",
        });
      } finally {
        client.release();
      }
    }
  );

  return router;
}
