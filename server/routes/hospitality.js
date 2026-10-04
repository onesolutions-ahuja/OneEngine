import express from "express";
import crypto from "node:crypto";
import { computeBasketTotals, roundCurrency } from "../src/utils/saleTotals.js";
import { getAllowedPaymentMethodCodes } from "../services/paymentMethods.js";
import { syncCanonicalSaleTransaction } from "../services/canonicalTransactions.js";
import { normaliseGiftCardCode, isCardRedeemable, validateRedemption } from "../services/giftCards.js";
import { getRequestPool } from "../services/tenantDatabase.js";
import { buildKitchenPrintPayload, validateHospitalitySessionTransition, validateQrOrderItems } from "../services/hospitalityActions.js";
import { calculateHospitalityServiceCharge, splitHospitalityLines, updateHospitalityItems, validateHospitalityPayment } from "../services/hospitalityBilling.js";
import { createAuditWriter } from "../services/auditLog.js";

const publicQrBillSalesSql = `SELECT b.id AS bill_id, b.status AS bill_status, b.service_charge_type,b.service_charge_value,
  b.service_charge_amount,b.service_charge_taxable,b.service_charge_tax,
  s.id AS sale_id, s.subtotal,s.tax,s.discount,s.total,s.status AS sale_status,
  COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id=s.id AND p.status='completed' AND p.direction='IN'),0)::numeric AS amount_paid
  FROM hospitality_bills b
  JOIN hospitality_bill_sales bs ON bs.bill_id=b.id
  JOIN sales s ON s.id=bs.sale_id
  WHERE b.company_id=$1 AND b.store_id=$2 AND b.session_id=$3 ORDER BY b.created_at`;

export default function createHospitalityRouter({ authenticate, authorize, db, pool, canAccessStore }) {
  const router = express.Router();
  const writeAudit = createAuditWriter({ db });

  const transact = async (work) => {
    const transactionPool = getRequestPool(pool);
    if (!transactionPool) throw Object.assign(new Error("DATABASE_URL is not configured"), { status: 503 });
    const client = await transactionPool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  const lifecycleError = (res, error, fallback) => {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    console.error(fallback, error);
    return res.status(500).json({ success: false, message: fallback });
  };

  const hospitalityScope = (req) => [req.user.companyId, req.user.storeId];

  router.get("/hospitality/dashboard", authenticate, authorize("hospitality.tables.view"), async (req, res) => {
    try {
      const [companyId, storeId] = hospitalityScope(req);
      const result = await db(`
        SELECT
          (SELECT COUNT(*)::int FROM hospitality_tables WHERE company_id=$1 AND store_id=$2 AND active=true AND status='OCCUPIED') AS occupied_tables,
          (SELECT COUNT(*)::int FROM hospitality_tables WHERE company_id=$1 AND store_id=$2 AND active=true AND status='EMPTY') AS available_tables,
          (SELECT COUNT(DISTINCT table_id)::int FROM hospitality_reservations WHERE company_id=$1 AND store_id=$2 AND reservation_date=CURRENT_DATE AND status='RESERVED' AND table_id IS NOT NULL) AS reserved_tables,
          (SELECT COUNT(*)::int FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2 AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED')) AS active_sessions,
          (SELECT COUNT(*)::int FROM hospitality_bills WHERE company_id=$1 AND store_id=$2 AND status='OPEN') AS open_bills,
          (SELECT COUNT(*)::int FROM hospitality_bills b JOIN hospitality_bill_sales bs ON bs.bill_id=b.id JOIN sales s ON s.id=bs.sale_id WHERE b.company_id=$1 AND b.store_id=$2 AND b.status='OPEN' AND EXISTS (SELECT 1 FROM payments p WHERE p.sale_id=s.id AND p.status='completed' AND p.direction='IN')) AS part_paid_bills,
          (SELECT COUNT(*)::int FROM hospitality_bills WHERE company_id=$1 AND store_id=$2 AND status='OPEN' AND id NOT IN (SELECT bill_id FROM hospitality_bill_sales)) AS unpaid_bills,
          (SELECT COALESCE(SUM(guests),0)::int FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2 AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED')) AS current_covers,
          (SELECT COUNT(*)::int FROM hospitality_reservations WHERE company_id=$1 AND store_id=$2 AND reservation_date=CURRENT_DATE AND status='RESERVED') AS reservations_today,
          (SELECT COUNT(*)::int FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2 AND started_at::date=CURRENT_DATE AND status <> 'CANCELLED' AND customer_id IS NULL) AS walk_ins_today,
          (SELECT COUNT(*)::int FROM hospitality_kds_tickets WHERE company_id=$1 AND store_id=$2 AND status <> 'COMPLETED') AS active_kds_tickets,
          (SELECT COUNT(*)::int FROM hospitality_kds_tickets WHERE company_id=$1 AND store_id=$2 AND status <> 'COMPLETED' AND created_at < NOW() - INTERVAL '20 minutes') AS delayed_kds_tickets,
          (SELECT COALESCE(SUM(s.total),0)::numeric FROM sales s JOIN hospitality_bill_sales bs ON bs.sale_id=s.id JOIN hospitality_bills b ON b.id=bs.bill_id WHERE s.company_id=$1 AND s.store_id=$2 AND s.created_at::date=CURRENT_DATE AND s.status <> 'cancelled') AS hospitality_sales_today,
          (SELECT COALESCE(SUM(s.hospitality_service_charge_amount),0)::numeric FROM sales s WHERE s.company_id=$1 AND s.store_id=$2 AND s.created_at::date=CURRENT_DATE AND s.status <> 'cancelled') AS service_charges_today,
          (SELECT COALESCE(SUM(t.amount),0)::numeric FROM hospitality_tips t WHERE t.company_id=$1 AND t.store_id=$2 AND t.created_at::date=CURRENT_DATE) AS tips_today
      `, [companyId, storeId]);
      res.json({ success: true, data: result.rows[0] || {} });
    } catch (error) { lifecycleError(res, error, "Unable to load hospitality dashboard"); }
  });

  router.get("/hospitality/reports", authenticate, authorize("hospitality.tables.view"), async (req, res) => {
    try {
      const [companyId, storeId] = hospitalityScope(req);
      const from = req.query.from || new Date().toISOString().slice(0, 10);
      const to = req.query.to || from;
      const result = await db(`
        SELECT s.started_at AS opened_at, s.ended_at AS closed_at, s.id AS session_id,
          s.status, s.guests, t.table_number, f.name AS floor_name, u.username AS operator,
          CASE WHEN r.id IS NULL THEN 'WALK_IN' ELSE 'RESERVATION' END AS source,
          COALESCE(SUM(sa.total),0)::numeric AS gross, COALESCE(SUM(sa.discount),0)::numeric AS discount,
          COALESCE(SUM(sa.total-sa.discount),0)::numeric AS net, COALESCE(SUM(sa.tax),0)::numeric AS vat,
          COALESCE(SUM(sa.hospitality_service_charge_amount),0)::numeric AS service_charge,
          COALESCE((SELECT SUM(ht.amount) FROM hospitality_tips ht WHERE ht.session_id=s.id),0)::numeric AS tips,
          COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id=sa.id AND p.status='completed' AND p.direction='IN'),0)::numeric AS paid,
          COALESCE(SUM(sa.total),0)::numeric - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id=sa.id AND p.status='completed' AND p.direction='IN'),0)::numeric AS remaining,
          EXTRACT(EPOCH FROM (COALESCE(s.ended_at,NOW())-s.started_at))/60 AS duration_minutes
        FROM hospitality_table_sessions s
        JOIN hospitality_tables t ON t.id=s.table_id AND t.company_id=$1 AND t.store_id=$2
        JOIN hospitality_floors f ON f.id=t.floor_id
        LEFT JOIN users u ON u.id=s.started_by
        LEFT JOIN hospitality_reservations r ON r.table_id=t.id AND r.reservation_date=s.started_at::date
        LEFT JOIN hospitality_bills b ON b.session_id=s.id AND b.company_id=$1 AND b.store_id=$2
        LEFT JOIN hospitality_bill_sales bs ON bs.bill_id=b.id
        LEFT JOIN sales sa ON sa.id=bs.sale_id AND sa.company_id=$1 AND sa.store_id=$2
        WHERE s.company_id=$1 AND s.store_id=$2 AND s.started_at::date BETWEEN $3::date AND $4::date
        GROUP BY s.id,t.table_number,f.name,u.username,r.id
        ORDER BY s.started_at DESC
      `, [companyId, storeId, from, to]);
      res.json({ success: true, data: result.rows });
    } catch (error) { lifecycleError(res, error, "Unable to load hospitality reports"); }
  });

  const refreshHospitalitySale = async (client, saleId, companyId, storeId, serviceChargeAmount = 0, serviceChargeTax = 0) => {
    const totals = await client.query(`SELECT COALESCE(SUM(GREATEST(unit_price*quantity-discount,0)),0)::numeric AS subtotal,
      COALESCE(SUM(tax),0)::numeric AS tax,COALESCE(SUM(discount),0)::numeric AS discount
      FROM sale_items WHERE sale_id=$1`, [saleId]);
    const subtotal = roundCurrency(Number(totals.rows[0].subtotal) + Number(serviceChargeAmount));
    const tax = roundCurrency(Number(totals.rows[0].tax) + Number(serviceChargeTax));
    const discount = roundCurrency(Number(totals.rows[0].discount));
    const updated = await client.query(`UPDATE sales SET subtotal=$4,tax=$5,discount=$6,total=$7,
      hospitality_service_charge_amount=$8,hospitality_service_charge_tax=$9
      WHERE id=$1 AND company_id=$2 AND store_id=$3 RETURNING *`, [saleId, companyId, storeId, subtotal, tax, discount, roundCurrency(subtotal + tax), Number(serviceChargeAmount), Number(serviceChargeTax)]);
    if (!updated.rows.length) throw Object.assign(new Error("Hospitality bill sale was not found"), { status: 404 });
    return updated.rows[0];
  };

  const ensureHospitalityBill = async (client, req, storeId, sessionId) => {
    const sessionResult = await client.query(`SELECT * FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3 FOR UPDATE`, [sessionId, req.user.companyId, storeId]);
    if (!sessionResult.rows.length) throw Object.assign(new Error("Hospitality session not found"), { status: 404 });
    const session = sessionResult.rows[0];
    let billResult = await client.query(`SELECT * FROM hospitality_bills WHERE session_id=$1 AND company_id=$2 AND store_id=$3 AND status='OPEN' FOR UPDATE`, [sessionId, req.user.companyId, storeId]);
    if (!billResult.rows.length) {
      billResult = await client.query(`INSERT INTO hospitality_bills(company_id,store_id,session_id,created_by)
        VALUES($1,$2,$3,$4) ON CONFLICT (company_id,store_id,session_id) WHERE status='OPEN' DO NOTHING RETURNING *`, [req.user.companyId, storeId, sessionId, req.user.id]);
      if (!billResult.rows.length) billResult = await client.query(`SELECT * FROM hospitality_bills WHERE session_id=$1
        AND company_id=$2 AND store_id=$3 AND status='OPEN' FOR UPDATE`, [sessionId, req.user.companyId, storeId]);
    }
    const bill = billResult.rows[0];
    const existingSale = await client.query("SELECT 1 FROM hospitality_bill_sales WHERE bill_id=$1 LIMIT 1", [bill.id]);
    if (existingSale.rows.length) return bill;
    const orders = await client.query(`SELECT id,order_number,items,created_at FROM hospitality_qr_orders WHERE company_id=$1 AND store_id=$2
      AND session_id=$3 AND payment_status='UNPAID' AND status<>'CANCELLED' ORDER BY created_at,id FOR UPDATE`, [req.user.companyId, storeId, sessionId]);
    const sourceItems = [];
    for (const order of orders.rows) {
      const originalItems = Array.isArray(order.items) ? order.items : [];
      const normalizedItems = originalItems.map((item) => ({ ...item,
        line_id: item.line_id || crypto.randomUUID(),
        held: item.held === true,
        fired_at: item.fired_at || (item.held === true ? null : order.created_at),
        course: item.course || null,
        course_sequence: item.course_sequence || null,
      }));
      if (normalizedItems.some((item, index) => item.line_id !== originalItems[index]?.line_id || item.fired_at !== originalItems[index]?.fired_at)) {
        await client.query("UPDATE hospitality_qr_orders SET items=$2::jsonb WHERE id=$1 AND company_id=$3 AND store_id=$4", [order.id, JSON.stringify(normalizedItems), req.user.companyId, storeId]);
        const tickets = await client.query("SELECT id,items FROM hospitality_kds_tickets WHERE company_id=$1 AND store_id=$2 AND order_number=$3 FOR UPDATE", [req.user.companyId, storeId, order.order_number]);
        for (const ticket of tickets.rows) {
          const ticketItems = (Array.isArray(ticket.items) ? ticket.items : []).map((item, index) => ({ ...item, line_id: normalizedItems[index]?.line_id || item.line_id, course: normalizedItems[index]?.course || item.course || null, course_sequence: normalizedItems[index]?.course_sequence || item.course_sequence || null }));
          await client.query("UPDATE hospitality_kds_tickets SET items=$2::jsonb WHERE id=$1 AND company_id=$3 AND store_id=$4", [ticket.id, JSON.stringify(ticketItems), req.user.companyId, storeId]);
        }
      }
      for (const item of normalizedItems) sourceItems.push({ ...item, order_number: order.order_number });
    }
    if (!sourceItems.length) return bill;
    const productIds = [...new Set(sourceItems.map((item) => item.product_id).filter(Boolean))];
    const products = await client.query("SELECT id,name,vat_rate,vat_applicable FROM products WHERE company_id=$1 AND id=ANY($2::uuid[])", [req.user.companyId, productIds]);
    const productById = new Map(products.rows.map((product) => [String(product.id), product]));
    if (productById.size !== productIds.length) throw Object.assign(new Error("One or more hospitality items no longer resolve to a company product"), { status: 409 });
    const settings = await client.query("SELECT vat_enabled,default_vat_rate FROM company_settings WHERE company_id=$1", [req.user.companyId]);
    const vatEnabled = settings.rows[0]?.vat_enabled !== false;
    const defaultVatRate = Number(settings.rows[0]?.default_vat_rate ?? 20);
    const saleItems = sourceItems.map((item) => {
      const product = productById.get(String(item.product_id));
      const price = Number(item.unit_price);
      const itemQuantity = Number(item.quantity);
      const vatRate = Number(item.vat_rate ?? product.vat_rate ?? defaultVatRate);
      const taxable = item.vat_applicable == null ? product.vat_applicable !== false : item.vat_applicable !== false;
      const tax = item.tax == null ? (vatEnabled && taxable ? roundCurrency(price * itemQuantity * vatRate / 100) : 0) : roundCurrency(Number(item.tax));
      return { ...item, product_name: item.name || product.name, unit_price: price, quantity: itemQuantity, tax, total: roundCurrency(price * itemQuantity + tax), vat_rate: vatRate, vat_applicable: taxable };
    });
    const subtotal = roundCurrency(saleItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0));
    const tax = roundCurrency(saleItems.reduce((sum, item) => sum + item.tax, 0));
    const saleResult = await client.query(`INSERT INTO sales(company_id,store_id,user_id,customer_id,subtotal,tax,total,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'hospitality_open') RETURNING *`, [req.user.companyId, storeId, req.user.id, session.customer_id, subtotal, tax, roundCurrency(subtotal + tax)]);
    const sale = saleResult.rows[0];
    for (const item of saleItems) {
      await client.query(`INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,discount,tax,total,item_type)
        VALUES($1,$2,$3,$4,$5,0,$6,$7,'PRODUCT')`, [sale.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.tax, item.total]);
    }
    await client.query("INSERT INTO hospitality_bill_sales(bill_id,sale_id) VALUES($1,$2)", [bill.id, sale.id]);
    await refreshHospitalitySale(client, sale.id, req.user.companyId, storeId, bill.service_charge_amount, bill.service_charge_tax);
    await client.query("UPDATE hospitality_qr_orders SET status='BILLED',sale_id=$4 WHERE company_id=$1 AND store_id=$2 AND session_id=$3 AND payment_status='UNPAID' AND status<>'CANCELLED'", [req.user.companyId, storeId, sessionId, sale.id]);
    return bill;
  };

  const getHospitalityBillSales = async (client, companyId, storeId, sessionIds, status = "OPEN") => client.query(`SELECT b.id AS bill_id,b.session_id,b.status AS bill_status,
      b.service_charge_type,b.service_charge_value,b.service_charge_amount,b.service_charge_taxable,b.service_charge_tax,
      s.id AS sale_id,bs.source_sale_id,s.subtotal,s.tax,s.discount,s.total,s.status AS sale_status,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id=s.id AND p.status='completed' AND p.direction='IN'),0)::numeric AS amount_paid
      FROM hospitality_bills b JOIN hospitality_bill_sales bs ON bs.bill_id=b.id JOIN sales s ON s.id=bs.sale_id
      WHERE b.company_id=$1 AND b.store_id=$2 AND b.session_id=ANY($3::uuid[]) AND ($4::text IS NULL OR b.status=$4)
      ORDER BY b.created_at,bs.created_at,s.created_at`, [companyId, storeId, sessionIds, status]);

  const resolveStoreId = async (req, fallbackStoreId = req.user?.storeId, explicitStoreId = req.query?.storeId ?? req.body?.storeId ?? fallbackStoreId) => {
    const requestedStoreId = explicitStoreId ?? fallbackStoreId ?? req.user?.storeId;
    if (!requestedStoreId) return null;

    const isRequestedStoreDifferent = req.user?.storeId && String(requestedStoreId) !== String(req.user.storeId);
    if (isRequestedStoreDifferent && (!canAccessStore || !(await canAccessStore(req.user, requestedStoreId)))) {
      const error = new Error("You do not have access to this store");
      error.status = 403;
      throw error;
    }

    if (!req.user?.storeId && canAccessStore && !(await canAccessStore(req.user, requestedStoreId))) {
      const error = new Error("You do not have access to this store");
      error.status = 403;
      throw error;
    }

    return requestedStoreId;
  };

  const scope = async (req) => {
    const requestedStoreId = await resolveStoreId(req, req.query?.storeId || req.user?.storeId, req.query?.storeId || req.user?.storeId);
    return [req.user.companyId, requestedStoreId || req.user.storeId];
  };

  const getPublicQrContext = async (token, user) => {
    const hash = crypto.createHash("sha256").update(String(token || "")).digest("hex");
    const qrSession = await db(`SELECT * FROM hospitality_qr_sessions WHERE token_hash=$1 AND active=true AND (expires_at IS NULL OR expires_at>NOW())`, [hash]);
    if (!qrSession.rows.length) return null;
    const q = qrSession.rows[0];
    if (user?.companyId && String(user.companyId) !== String(q.company_id)) return null;
    if (user?.storeId && String(user.storeId) !== String(q.store_id)) return null;
    const session = await db(`SELECT id, company_id, store_id, table_id, customer_id, status, guests FROM hospitality_table_sessions
      WHERE company_id=$1 AND store_id=$2 AND table_id=$3
      ORDER BY CASE WHEN status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') THEN 0 ELSE 1 END, started_at DESC LIMIT 1`, [q.company_id, q.store_id, q.table_id]);
    if (!session.rows.length) return null;
    const activeSession = session.rows[0];
    if (String(activeSession.company_id) !== String(q.company_id) || String(activeSession.store_id) !== String(q.store_id) || String(activeSession.table_id) !== String(q.table_id)) {
      return null;
    }
    const context = {
      company_id: q.company_id,
      store_id: q.store_id,
      table_id: q.table_id,
      table_number: "Table 1",
      table_name: null,
      session_id: activeSession.id,
      session_status: activeSession.status,
      session_guests: activeSession.guests,
    };
    const bill = await db(publicQrBillSalesSql, [context.company_id, context.store_id, context.session_id]);
    context.bill = bill.rows;
    return context;
  };

  const hasConflictingPublicIds = (req, context) => {
    const supplied = { ...req.query, ...req.body };
    const checks = [
      ["companyId", "company_id", context.company_id],
      ["storeId", "store_id", context.store_id],
      ["sessionId", "session_id", context.session_id],
    ];
    return checks.some(([camel, snake, expected]) => {
      const value = supplied[camel] ?? supplied[snake];
      return value != null && String(value) !== String(expected);
    });
  };

  const getPublicPaymentAvailability = async (companyId) => {
    const methods = await getAllowedPaymentMethodCodes(db, companyId);
    const providerRows = await db(`SELECT id FROM integration_connections WHERE company_id=$1 AND enabled=true AND provider_name IS NOT NULL AND TRIM(provider_name)<>'' LIMIT 1`, [companyId]);
    const hasProvider = providerRows.rows.length > 0;
    return { methods: methods.filter((method) => method && typeof method === "string"), hasProvider };
  };

  const findPublicQrPayment = async (query, params) => {
    const match = await query(`SELECT 1 FROM payments WHERE company_id=$1 AND store_id=$2 AND sale_id=ANY($3::uuid[]) AND reference=$4 LIMIT 1`, params);
    if (!match.rows.length) return null;
    const payments = match.rows[0].amount != null
      ? match.rows
      : (await query(`SELECT id,amount,payment_method,status FROM payments WHERE company_id=$1 AND store_id=$2 AND sale_id=ANY($3::uuid[]) AND reference=$4`, params)).rows;
    if (!payments.length) return null;
    return {
      amount: roundCurrency(payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)),
      payment_method: payments[0].payment_method,
      status: payments.every((payment) => payment.status === "completed") ? "completed" : payments[0].status,
    };
  };

  router.get("/hospitality/floors", authenticate, authorize("hospitality.tables.view"), async (req, res) => {
    try {
      const scoped = await scope(req);
      const result = await db(
        `SELECT f.*, COUNT(t.id)::int AS table_count
           FROM hospitality_floors f LEFT JOIN hospitality_tables t ON t.floor_id=f.id AND t.active=true
          WHERE f.company_id=$1 AND f.store_id=$2 GROUP BY f.id ORDER BY f.display_order, f.name`,
        scoped
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Hospitality floors error:", error); res.status(500).json({ success: false, message: "Unable to load floors" });
    }
  });

  router.post("/hospitality/floors", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    const { name, storeId = req.user.storeId, displayOrder = 0 } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Floor name is required" });
    try {
      const resolvedStoreId = await resolveStoreId(req, req.user?.storeId, storeId);
      const result = await db(`INSERT INTO hospitality_floors (company_id,store_id,name,display_order) VALUES ($1,$2,$3,$4) RETURNING *`, [req.user.companyId, resolvedStoreId, name.trim(), Number(displayOrder) || 0]);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Create floor error:", error); res.status(500).json({ success: false, message: "Unable to create floor" });
    }
  });

  router.put("/hospitality/floors/:id", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    try {
      const resolvedStoreId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await db(`UPDATE hospitality_floors SET name=COALESCE($3,name), active=COALESCE($4,active), display_order=COALESCE($5,display_order), updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$6 RETURNING *`, [req.params.id, req.user.companyId, req.body.name?.trim() || null, typeof req.body.active === "boolean" ? req.body.active : null, Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : null, resolvedStoreId]);
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Floor not found" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Update floor error:", error); res.status(500).json({ success: false, message: "Unable to update floor" });
    }
  });

  router.get("/hospitality/tables", authenticate, authorize("hospitality.tables.view"), async (req, res) => {
    try {
      const scoped = await scope(req);
      const result = await db(
        `SELECT t.*, f.name AS floor_name,
          COALESCE((SELECT r.status FROM hospitality_reservations r WHERE r.table_id=t.id AND r.reservation_date=CURRENT_DATE AND r.status='RESERVED' ORDER BY r.reservation_time LIMIT 1),'') AS reservation_status,
          (SELECT r.reservation_time FROM hospitality_reservations r WHERE r.table_id=t.id AND r.reservation_date=CURRENT_DATE AND r.status='RESERVED' ORDER BY r.reservation_time LIMIT 1) AS reservation_time,
          (COALESCE((SELECT SUM(GREATEST(sale.total-COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.sale_id=sale.id AND p.status='completed' AND p.direction='IN'),0),0)) FROM hospitality_bills b JOIN hospitality_bill_sales bs ON bs.bill_id=b.id JOIN sales sale ON sale.id=bs.sale_id
             WHERE b.company_id=t.company_id AND b.store_id=t.store_id AND b.status='OPEN' AND b.session_id IN
               (SELECT grouped.id FROM hospitality_table_sessions grouped WHERE grouped.id=hs.id OR grouped.merged_into_session_id=hs.id)),0)
           + COALESCE((SELECT SUM(q.total) FROM hospitality_qr_orders q WHERE q.company_id=t.company_id AND q.store_id=t.store_id
             AND q.session_id IN (SELECT grouped.id FROM hospitality_table_sessions grouped WHERE grouped.id=hs.id OR grouped.merged_into_session_id=hs.id)
             AND q.payment_status='UNPAID' AND q.status NOT IN ('CANCELLED','BILLED')),0))::numeric AS current_bill,
          COALESCE((SELECT COUNT(*) FROM hospitality_qr_orders q WHERE q.company_id=t.company_id AND q.store_id=t.store_id
            AND q.session_id IN (SELECT grouped.id FROM hospitality_table_sessions grouped WHERE grouped.id=hs.id OR grouped.merged_into_session_id=hs.id)
            AND q.payment_status='UNPAID' AND q.status<>'CANCELLED'),0)::int AS open_order_count,
          hs.id AS session_id,
          hs.status AS session_status,
          hs.guests AS session_guests,
          (SELECT COUNT(*)::int FROM hospitality_table_merges m JOIN hospitality_table_sessions s ON s.id=m.target_session_id WHERE s.company_id=t.company_id AND s.store_id=t.store_id AND s.table_id=t.id AND m.unmerged_at IS NULL) AS active_merge_count,
          (SELECT target.table_number FROM hospitality_table_sessions source JOIN hospitality_table_sessions parent ON parent.id=source.merged_into_session_id JOIN hospitality_tables target ON target.id=parent.table_id WHERE source.company_id=t.company_id AND source.store_id=t.store_id AND source.table_id=t.id AND source.status='MERGED' LIMIT 1) AS merged_into_table_number
         FROM hospitality_tables t JOIN hospitality_floors f ON f.id=t.floor_id
         LEFT JOIN LATERAL (SELECT s.id,s.status,s.guests FROM hospitality_table_sessions s WHERE s.company_id=t.company_id AND s.store_id=t.store_id AND s.table_id=t.id AND s.status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') ORDER BY s.started_at DESC LIMIT 1) hs ON TRUE
        WHERE t.company_id=$1 AND t.store_id=$2 AND t.active=true ORDER BY f.display_order,t.table_number`,
        scoped
      );
      res.json({ success: true, data: result.rows });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Hospitality tables error:", error); res.status(500).json({ success: false, message: "Unable to load tables" });
    }
  });

  router.post("/hospitality/tables", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    const { floorId, tableNumber, name = null, capacity = 2, shape = "square", positionX = 0, positionY = 0 } = req.body || {};
    if (!floorId || !tableNumber?.trim()) return res.status(400).json({ success: false, message: "Floor and table number are required" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await db(`INSERT INTO hospitality_tables (company_id,store_id,floor_id,table_number,name,capacity,shape,position_x,position_y) SELECT $1,store_id,id,$3,$4,$5,$6,$7,$8 FROM hospitality_floors WHERE id=$2 AND company_id=$1 AND store_id=$9 RETURNING *`, [req.user.companyId, floorId, tableNumber.trim(), name?.trim() || null, Number(capacity) || 2, shape, Number(positionX) || 0, Number(positionY) || 0, storeId]);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Create table error:", error); res.status(500).json({ success: false, message: "Unable to create table" });
    }
  });

  router.put("/hospitality/tables/:id", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    try {
      const requestedStatus = req.body.status == null ? null : String(req.body.status).toUpperCase();
      if (requestedStatus && !["EMPTY", "RESERVED", "OCCUPIED"].includes(requestedStatus)) return res.status(400).json({ success: false, message: "Invalid table status" });
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      if (requestedStatus === "EMPTY") {
        const activeSession = await db(`SELECT 1 FROM hospitality_table_sessions WHERE table_id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') LIMIT 1`, [req.params.id, req.user.companyId, storeId]);
        if (activeSession.rows.length) return res.status(409).json({ success: false, message: "Complete or cancel the active session before clearing this table" });
      }
      const result = await db(`UPDATE hospitality_tables SET table_number=COALESCE($3,table_number), name=COALESCE($4,name), capacity=COALESCE($5,capacity), shape=COALESCE($6,shape), position_x=COALESCE($7,position_x), position_y=COALESCE($8,position_y), active=COALESCE($9,active), status=COALESCE($10,status), updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$11 RETURNING *`, [req.params.id, req.user.companyId, req.body.tableNumber?.trim() || null, req.body.name?.trim() || null, req.body.capacity == null ? null : Number(req.body.capacity), req.body.shape || null, req.body.positionX == null ? null : Number(req.body.positionX), req.body.positionY == null ? null : Number(req.body.positionY), typeof req.body.active === "boolean" ? req.body.active : null, requestedStatus, storeId]);
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Table not found" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Update table error:", error); res.status(500).json({ success: false, message: "Unable to update table" });
    }
  });

  router.get("/hospitality/reservations", authenticate, authorize("hospitality.reservations.view"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.query?.storeId || req.user?.storeId, req.query?.storeId || req.user?.storeId);
      const result = await db(`SELECT r.*, t.table_number FROM hospitality_reservations r LEFT JOIN hospitality_tables t ON t.id=r.table_id WHERE r.company_id=$1 AND r.store_id=$2 AND r.reservation_date BETWEEN COALESCE($3::date,CURRENT_DATE) AND COALESCE($4::date,CURRENT_DATE+7) ORDER BY r.reservation_date,r.reservation_time`, [req.user.companyId, storeId, req.query.dateFrom || null, req.query.dateTo || null]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Reservations error:", error); res.status(500).json({ success: false, message: "Unable to load reservations" });
    }
  });

  router.post("/hospitality/reservations", authenticate, authorize("hospitality.reservations.manage"), async (req, res) => {
    const { tableId = null, customerId = null, customerName, reservationDate, reservationTime, guests, notes = null } = req.body || {};
    if (!customerName?.trim() || !reservationDate || !reservationTime || !Number.isInteger(Number(guests)) || Number(guests) < 1) return res.status(400).json({ success: false, message: "Name, date, time and guests are required" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await db(`INSERT INTO hospitality_reservations (company_id,store_id,table_id,customer_id,customer_name,reservation_date,reservation_time,guests,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [req.user.companyId, storeId, tableId, customerId, customerName.trim(), reservationDate, reservationTime, Number(guests), notes?.trim() || null, req.user.id]);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("Create reservation error:", error); res.status(500).json({ success: false, message: "Unable to create reservation" });
    }
  });

  router.post("/hospitality/tables/:id/sessions", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    const guests = req.body?.guests == null ? 1 : Number(req.body.guests);
    const customerId = req.body?.customerId || null;
    if (!Number.isInteger(guests) || guests < 1) return res.status(400).json({ success: false, message: "Guest count must be a positive whole number" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const session = await transact(async (client) => {
        const table = await client.query(`SELECT id,capacity,status FROM hospitality_tables
          WHERE id=$1 AND company_id=$2 AND store_id=$3 AND active=true FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!table.rows.length) throw Object.assign(new Error("Table not found"), { status: 404 });
        if (table.rows[0].status !== "EMPTY") throw Object.assign(new Error("Walk-ins can only be opened on an empty table"), { status: 409 });
        if (guests > Number(table.rows[0].capacity)) throw Object.assign(new Error("Guest count exceeds table capacity"), { status: 400 });
        const reservation = await client.query(`SELECT 1 FROM hospitality_reservations WHERE company_id=$1 AND store_id=$2
          AND table_id=$3 AND reservation_date=CURRENT_DATE AND status='RESERVED' LIMIT 1`, [req.user.companyId, storeId, req.params.id]);
        if (reservation.rows.length) throw Object.assign(new Error("Table is reserved today"), { status: 409 });
        if (customerId) {
          const customer = await client.query("SELECT id FROM customers WHERE id=$1 AND company_id=$2 AND active=true", [customerId, req.user.companyId]);
          if (!customer.rows.length) throw Object.assign(new Error("Customer not found"), { status: 400 });
        }
        const existing = await client.query(`SELECT id FROM hospitality_table_sessions
          WHERE company_id=$1 AND store_id=$2 AND table_id=$3 AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.user.companyId, storeId, req.params.id]);
        if (existing.rows.length) throw Object.assign(new Error("Table already has an active session"), { status: 409 });
        const created = await client.query(`INSERT INTO hospitality_table_sessions
          (company_id,store_id,table_id,customer_id,guests,status,started_by)
          VALUES ($1,$2,$3,$4,$5,'OPEN',$6) RETURNING *`, [req.user.companyId, storeId, req.params.id, customerId, guests, req.user.id]);
        await client.query("UPDATE hospitality_tables SET status='OCCUPIED',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [req.params.id, req.user.companyId, storeId]);
        return created.rows[0];
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.walk_in.opened", entityType: "hospitality_table_session", entityId: session.id, metadata: { tableId: req.params.id, guests, customerId } });
      res.status(201).json({ success: true, data: session });
    } catch (error) { lifecycleError(res, error, "Unable to open walk-in session"); }
  });

  router.post("/hospitality/sessions/:id/orders", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    const clientRequestId = String(req.body?.clientRequestId || req.get("Idempotency-Key") || "").trim();
    const requested = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!clientRequestId || clientRequestId.length > 120) return res.status(400).json({ success: false, message: "A stable order idempotency key is required" });
    if (!requested.length || requested.some((item) => !item?.productId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) return res.status(400).json({ success: false, message: "Order items are required" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const existing = await client.query("SELECT * FROM hospitality_qr_orders WHERE company_id=$1 AND store_id=$2 AND client_request_id=$3", [req.user.companyId, storeId, clientRequestId]);
        if (existing.rows.length) return { order: existing.rows[0], idempotent: true };
        const session = await client.query("SELECT id,table_id,status FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3 AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE", [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Hospitality session not found or is no longer active"), { status: 409 });
        const products = await client.query("SELECT id,name,price,vat_rate,vat_applicable FROM products WHERE company_id=$1 AND active=true AND id=ANY($2::uuid[])", [req.user.companyId, [...new Set(requested.map((item) => item.productId))]]);
        const byId = new Map(products.rows.map((product) => [String(product.id), product]));
        if (byId.size !== new Set(requested.map((item) => item.productId)).size) throw Object.assign(new Error("One or more order items are unavailable"), { status: 409 });
        const items = requested.map((item) => { const product = byId.get(String(item.productId)); const quantity = Number(item.quantity); const tax = product.vat_applicable === false ? 0 : Number(product.price) * quantity * Number(product.vat_rate || 0) / 100; return { line_id: item.lineId || `${clientRequestId}-${item.productId}`, product_id: product.id, name: product.name, quantity, unit_price: Number(product.price), tax, notes: item.notes || null, course: item.course || null, course_sequence: item.courseSequence || null, held: item.held === true, fired_at: item.held === true ? null : new Date().toISOString() }; });
        const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
        const tax = items.reduce((sum, item) => sum + item.tax, 0);
        const order = await client.query("INSERT INTO hospitality_qr_orders(company_id,store_id,table_id,session_id,order_number,items,subtotal,tax,total,payment_mode,client_request_id) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,'PAY_AT_TILL',$10) RETURNING *", [req.user.companyId, storeId, session.rows[0].table_id, req.params.id, `H-${Date.now().toString(36).toUpperCase()}`, JSON.stringify(items), subtotal, tax, subtotal + tax, clientRequestId]);
        const fired = items.filter((item) => !item.held);
        if (fired.length) await client.query("INSERT INTO hospitality_kds_tickets(company_id,store_id,table_id,session_id,order_number,items,notes) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)", [req.user.companyId, storeId, session.rows[0].table_id, req.params.id, order.rows[0].order_number, JSON.stringify(fired), req.body?.notes || null]);
        await client.query("UPDATE hospitality_table_sessions SET status='ORDERING',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [req.params.id, req.user.companyId, storeId]);
        await client.query("UPDATE hospitality_tables SET status='OCCUPIED',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [session.rows[0].table_id, req.user.companyId, storeId]);
        return { order: order.rows[0], idempotent: false };
      });
      res.status(result.idempotent ? 200 : 201).json({ success: true, data: result.order, idempotent: result.idempotent });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message });
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("Hospitality order error:", error); res.status(500).json({ success: false, message: "Unable to submit Hospitality order" });
    }
  });

  router.post("/hospitality/tables/:id/transfer", authenticate, authorize("hospitality.table.transfer"), async (req, res) => {
    const targetTableId = req.body?.targetTableId;
    if (!targetTableId || String(targetTableId) === String(req.params.id)) return res.status(400).json({ success: false, message: "Choose a different destination table" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const tables = await client.query(`SELECT id,status,capacity FROM hospitality_tables WHERE id=ANY($1::uuid[])
          AND company_id=$2 AND store_id=$3 AND active=true ORDER BY id FOR UPDATE`, [[req.params.id, targetTableId], req.user.companyId, storeId]);
        if (tables.rows.length !== 2) throw Object.assign(new Error("Both tables must belong to the selected company and store"), { status: 404 });
        const byId = new Map(tables.rows.map((table) => [String(table.id), table]));
        const source = byId.get(String(req.params.id)), target = byId.get(String(targetTableId));
        if (source.status !== "OCCUPIED" || target.status !== "EMPTY") throw Object.assign(new Error("Transfer requires an occupied source and an empty destination"), { status: 409 });
        const reservation = await client.query(`SELECT 1 FROM hospitality_reservations WHERE company_id=$1 AND store_id=$2
          AND table_id=$3 AND reservation_date=CURRENT_DATE AND status='RESERVED' LIMIT 1`, [req.user.companyId, storeId, targetTableId]);
        if (reservation.rows.length) throw Object.assign(new Error("Destination table is reserved"), { status: 409 });
        const occupiedSession = await client.query(`SELECT 1 FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND table_id=$3 AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') LIMIT 1`, [req.user.companyId, storeId, targetTableId]);
        if (occupiedSession.rows.length) throw Object.assign(new Error("Destination table already has an active session"), { status: 409 });
        const sessions = await client.query(`SELECT * FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND table_id=$3 AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.user.companyId, storeId, req.params.id]);
        if (!sessions.rows.length) throw Object.assign(new Error("Source table has no active hospitality session"), { status: 409 });
        if (Number(sessions.rows[0].guests) > Number(target.capacity)) throw Object.assign(new Error("Destination table capacity is too small for this session"), { status: 409 });
        const activeMerge = await client.query("SELECT 1 FROM hospitality_table_merges WHERE target_session_id=$1 AND unmerged_at IS NULL LIMIT 1", [sessions.rows[0].id]);
        if (activeMerge.rows.length) throw Object.assign(new Error("Unmerge this table group before transferring it"), { status: 409 });
        await client.query("UPDATE hospitality_table_sessions SET table_id=$2,updated_at=NOW() WHERE id=$1 AND company_id=$3 AND store_id=$4", [sessions.rows[0].id, targetTableId, req.user.companyId, storeId]);
        await client.query("UPDATE hospitality_qr_orders SET table_id=$2 WHERE session_id=$1 AND company_id=$3 AND store_id=$4", [sessions.rows[0].id, targetTableId, req.user.companyId, storeId]);
        await client.query("UPDATE hospitality_kds_tickets SET table_id=$2 WHERE session_id=$1 AND company_id=$3 AND store_id=$4", [sessions.rows[0].id, targetTableId, req.user.companyId, storeId]);
        await client.query("UPDATE hospitality_qr_sessions SET table_id=$2 WHERE company_id=$3 AND store_id=$4 AND table_id=$1 AND active=true", [req.params.id, targetTableId, req.user.companyId, storeId]);
        await client.query("UPDATE hospitality_tables SET status=CASE WHEN id=$1 THEN 'EMPTY' ELSE 'OCCUPIED' END,updated_at=NOW() WHERE id=ANY($2::uuid[]) AND company_id=$3 AND store_id=$4", [req.params.id, [req.params.id, targetTableId], req.user.companyId, storeId]);
        return { sessionId: sessions.rows[0].id };
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.table.transferred", entityType: "hospitality_table_session", entityId: result.sessionId, metadata: { fromTableId: req.params.id, toTableId: targetTableId } });
      res.json({ success: true, data: result });
    } catch (error) { lifecycleError(res, error, "Unable to transfer table session"); }
  });

  router.post("/hospitality/tables/merge", authenticate, authorize("hospitality.table.transfer"), async (req, res) => {
    const tableIds = [...new Set((Array.isArray(req.body?.tableIds) ? req.body.tableIds : []).map(String))];
    const targetTableId = String(req.body?.targetTableId || "");
    if (tableIds.length < 2 || !targetTableId || !tableIds.includes(targetTableId)) return res.status(400).json({ success: false, message: "Choose at least two occupied tables and a target from that group" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const tables = await client.query(`SELECT id,status,capacity FROM hospitality_tables WHERE id=ANY($1::uuid[])
          AND company_id=$2 AND store_id=$3 AND active=true ORDER BY id FOR UPDATE`, [tableIds, req.user.companyId, storeId]);
        if (tables.rows.length !== tableIds.length) throw Object.assign(new Error("Tables must belong to the selected company and store"), { status: 404 });
        if (tables.rows.some((table) => table.status !== "OCCUPIED")) throw Object.assign(new Error("Only occupied tables can be merged"), { status: 409 });
        const sessions = await client.query(`SELECT * FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND table_id=ANY($3::uuid[]) AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') ORDER BY table_id FOR UPDATE`, [req.user.companyId, storeId, tableIds]);
        if (sessions.rows.length !== tableIds.length) throw Object.assign(new Error("Every table must have an active hospitality session"), { status: 409 });
        const totalGuests = sessions.rows.reduce((total, row) => total + Number(row.guests), 0);
        const totalCapacity = tables.rows.reduce((total, row) => total + Number(row.capacity), 0);
        if (totalGuests > totalCapacity) throw Object.assign(new Error("The merged table group does not have enough capacity"), { status: 409 });
        const byTable = new Map(sessions.rows.map((session) => [String(session.table_id), session]));
        const targetSession = byTable.get(targetTableId);
        const merge = await client.query(`INSERT INTO hospitality_table_merges (company_id,store_id,target_session_id,created_by)
          VALUES ($1,$2,$3,$4) RETURNING id`, [req.user.companyId, storeId, targetSession.id, req.user.id]);
        const mergeId = merge.rows[0].id;
        for (const tableId of tableIds) {
          const session = byTable.get(tableId);
          const isTarget = tableId === targetTableId;
          await client.query(`INSERT INTO hospitality_table_merge_members (merge_id,session_id,table_id,original_status,is_target)
            VALUES ($1,$2,$3,$4,$5)`, [mergeId, session.id, tableId, session.status, isTarget]);
          if (isTarget) continue;
          await client.query(`INSERT INTO hospitality_table_merge_orders (merge_id,order_id,original_session_id,original_table_id)
            SELECT $1,id,session_id,table_id FROM hospitality_qr_orders WHERE company_id=$2 AND store_id=$3 AND session_id=$4`, [mergeId, req.user.companyId, storeId, session.id]);
          await client.query(`INSERT INTO hospitality_table_merge_tickets (merge_id,ticket_id,original_session_id,original_table_id)
            SELECT $1,id,$4,COALESCE(table_id,$5) FROM hospitality_kds_tickets WHERE company_id=$2 AND store_id=$3 AND (session_id=$4 OR (session_id IS NULL AND table_id=$5))`, [mergeId, req.user.companyId, storeId, session.id, tableId]);
          await client.query("UPDATE hospitality_qr_orders SET session_id=$2,table_id=$3 WHERE company_id=$4 AND store_id=$5 AND session_id=$1", [session.id, targetSession.id, targetTableId, req.user.companyId, storeId]);
          await client.query("UPDATE hospitality_kds_tickets SET session_id=$2,table_id=$3 WHERE company_id=$4 AND store_id=$5 AND (session_id=$1 OR (session_id IS NULL AND table_id=$6))", [session.id, targetSession.id, targetTableId, req.user.companyId, storeId, tableId]);
          await client.query("UPDATE hospitality_table_sessions SET status='MERGED',merged_into_session_id=$2,updated_at=NOW() WHERE id=$1 AND company_id=$3 AND store_id=$4", [session.id, targetSession.id, req.user.companyId, storeId]);
        }
        await client.query("UPDATE hospitality_tables SET status='MERGED',updated_at=NOW() WHERE id=ANY($1::uuid[]) AND id<>$2 AND company_id=$3 AND store_id=$4", [tableIds, targetTableId, req.user.companyId, storeId]);
        return { mergeId, targetSessionId: targetSession.id };
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.tables.merged", entityType: "hospitality_table_merge", entityId: result.mergeId, metadata: { tableIds, targetTableId } });
      res.status(201).json({ success: true, data: result });
    } catch (error) { lifecycleError(res, error, "Unable to merge tables"); }
  });

  router.post("/hospitality/tables/:id/unmerge", authenticate, authorize("hospitality.table.transfer"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const table = await client.query("SELECT id FROM hospitality_tables WHERE id=$1 AND company_id=$2 AND store_id=$3 AND active=true FOR UPDATE", [req.params.id, req.user.companyId, storeId]);
        if (!table.rows.length) throw Object.assign(new Error("Table not found"), { status: 404 });
        const session = await client.query(`SELECT id FROM hospitality_table_sessions WHERE table_id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Table has no active session"), { status: 409 });
        const merge = await client.query(`SELECT id FROM hospitality_table_merges WHERE target_session_id=$1 AND company_id=$2 AND store_id=$3
          AND unmerged_at IS NULL AND ($4::uuid IS NULL OR id=$4) ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [session.rows[0].id, req.user.companyId, storeId, req.body?.mergeId || null]);
        if (!merge.rows.length) throw Object.assign(new Error("No active table merge was found"), { status: 404 });
        const mergeId = merge.rows[0].id;
        const members = await client.query("SELECT * FROM hospitality_table_merge_members WHERE merge_id=$1 ORDER BY is_target DESC FOR UPDATE", [mergeId]);
        const orders = await client.query("UPDATE hospitality_qr_orders q SET session_id=m.original_session_id,table_id=m.original_table_id FROM hospitality_table_merge_orders m WHERE m.merge_id=$1 AND q.id=m.order_id RETURNING q.id", [mergeId]);
        const expectedOrders = await client.query("SELECT COUNT(*)::int AS count FROM hospitality_table_merge_orders WHERE merge_id=$1", [mergeId]);
        if (orders.rows.length !== Number(expectedOrders.rows[0].count)) throw Object.assign(new Error("Order ownership history is incomplete; merge was not changed"), { status: 409 });
        const tickets = await client.query("UPDATE hospitality_kds_tickets k SET session_id=m.original_session_id,table_id=m.original_table_id FROM hospitality_table_merge_tickets m WHERE m.merge_id=$1 AND k.id=m.ticket_id RETURNING k.id", [mergeId]);
        const expectedTickets = await client.query("SELECT COUNT(*)::int AS count FROM hospitality_table_merge_tickets WHERE merge_id=$1", [mergeId]);
        if (tickets.rows.length !== Number(expectedTickets.rows[0].count)) throw Object.assign(new Error("Kitchen ticket history is incomplete; merge was not changed"), { status: 409 });
        for (const member of members.rows) {
          if (member.is_target) continue;
          await client.query(`UPDATE hospitality_table_sessions SET status=$2,merged_into_session_id=NULL,updated_at=NOW()
            WHERE id=$1 AND company_id=$3 AND store_id=$4`, [member.session_id, member.original_status, req.user.companyId, storeId]);
          await client.query("UPDATE hospitality_tables SET status='OCCUPIED',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [member.table_id, req.user.companyId, storeId]);
        }
        await client.query("UPDATE hospitality_table_merges SET unmerged_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [mergeId, req.user.companyId, storeId]);
        return { mergeId, restoredTableIds: members.rows.filter((member) => !member.is_target).map((member) => member.table_id) };
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.tables.unmerged", entityType: "hospitality_table_merge", entityId: result.mergeId, metadata: { tableId: req.params.id, restoredTableIds: result.restoredTableIds } });
      res.json({ success: true, data: result });
    } catch (error) { lifecycleError(res, error, "Unable to unmerge tables"); }
  });

  router.put("/hospitality/sessions/:id/status", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    const nextStatus = String(req.body?.status || "").toUpperCase();
    if (!nextStatus) return res.status(400).json({ success: false, message: "Session status is required" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const updated = await transact(async (client) => {
        const current = await client.query(`SELECT * FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!current.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        let status;
        try { status = validateHospitalitySessionTransition(current.rows[0].status, nextStatus); }
        catch (error) { throw Object.assign(error, { status: 400 }); }
        if (["COMPLETED", "CANCELLED"].includes(status)) {
          const unpaid = await client.query(`SELECT 1 FROM hospitality_qr_orders WHERE session_id=$1 AND company_id=$2 AND store_id=$3
            AND payment_status='UNPAID' AND status<>'CANCELLED' LIMIT 1`, [req.params.id, req.user.companyId, storeId]);
          if (unpaid.rows.length) throw Object.assign(new Error("Unpaid orders must be settled before completing or cancelling the session"), { status: 409 });
        }
        const session = await client.query(`UPDATE hospitality_table_sessions SET status=$2,
          ended_at=CASE WHEN $2 IN ('COMPLETED','CANCELLED') THEN NOW() ELSE NULL END,updated_at=NOW()
          WHERE id=$1 AND company_id=$3 AND store_id=$4 RETURNING *`, [req.params.id, status, req.user.companyId, storeId]);
        if (["COMPLETED", "CANCELLED"].includes(status)) await client.query("UPDATE hospitality_tables SET status='EMPTY',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [current.rows[0].table_id, req.user.companyId, storeId]);
        return session.rows[0];
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.session.status_changed", entityType: "hospitality_table_session", entityId: updated.id, metadata: { status: updated.status } });
      res.json({ success: true, data: updated });
    } catch (error) { lifecycleError(res, error, "Unable to update hospitality session status"); }
  });

  router.post("/hospitality/sessions/:id/bill/prepare", authenticate, authorize("hospitality.bill.pay", "hospitality.bill.split"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const session = await client.query(`SELECT id FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        const group = await client.query(`SELECT id FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND (id=$3 OR (status='MERGED' AND merged_into_session_id=$3))`, [req.user.companyId, storeId, req.params.id]);
        for (const groupedSession of group.rows) await ensureHospitalityBill(client, req, storeId, groupedSession.id);
        return { sessionId: req.params.id, billCount: group.rows.length };
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) { lifecycleError(res, error, "Unable to prepare hospitality bill"); }
  });

  router.get("/hospitality/sessions/:id/bill", authenticate, authorize("hospitality.tables.view"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.query?.storeId ?? req.user?.storeId);
      const session = await db(`SELECT id FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
        AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED')`, [req.params.id, req.user.companyId, storeId]);
      if (!session.rows.length) return res.status(404).json({ success: false, message: "Active hospitality session not found" });
      const group = await db(`SELECT id FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
        AND (id=$3 OR (status='MERGED' AND merged_into_session_id=$3))`, [req.user.companyId, storeId, req.params.id]);
      const sessionIds = group.rows.map((row) => row.id);
      const sales = await getHospitalityBillSales({ query: db }, req.user.companyId, storeId, sessionIds, null);
      const saleIds = sales.rows.map((row) => row.sale_id);
      const items = saleIds.length ? await db(`SELECT si.*,s.receipt_number FROM sale_items si JOIN sales s ON s.id=si.sale_id
        WHERE si.sale_id=ANY($1::uuid[]) AND s.company_id=$2 AND s.store_id=$3 ORDER BY s.created_at,si.id`, [saleIds, req.user.companyId, storeId]) : { rows: [] };
      const payments = saleIds.length ? await db(`SELECT p.id,p.sale_id,p.payment_method,p.amount,p.status,p.created_at,
        COALESCE(t.amount,0)::numeric AS tip_amount FROM payments p LEFT JOIN hospitality_tips t ON t.payment_id=p.id
        WHERE p.sale_id=ANY($1::uuid[]) AND p.company_id=$2 AND p.store_id=$3 ORDER BY p.created_at,p.id`, [saleIds, req.user.companyId, storeId]) : { rows: [] };
      const tips = saleIds.length ? await db(`SELECT COALESCE(SUM(t.amount),0)::numeric AS total FROM hospitality_tips t
        WHERE t.bill_id=ANY($1::uuid[]) AND t.company_id=$2 AND t.store_id=$3`, [[...new Set(sales.rows.map((row) => row.bill_id))], req.user.companyId, storeId]) : { rows: [{ total: 0 }] };
      const unbilled = await db(`SELECT id,session_id,sale_id,order_number,items,subtotal,tax,total,status,payment_status FROM hospitality_qr_orders WHERE company_id=$1 AND store_id=$2
        AND session_id=ANY($3::uuid[]) AND status<>'CANCELLED' ORDER BY created_at`, [req.user.companyId, storeId, sessionIds]);
      const billedTotal = sales.rows.reduce((sum, row) => sum + Number(row.total), 0);
      const paid = sales.rows.reduce((sum, row) => sum + Number(row.amount_paid), 0);
      const unbilledTotal = unbilled.rows.filter((row) => row.payment_status === "UNPAID" && row.status !== "BILLED").reduce((sum, row) => sum + Number(row.total), 0);
      const billConfigs = [...new Map(sales.rows.map((row) => [row.bill_id, row])).values()];
      const serviceCharge = billConfigs.reduce((sum, row) => sum + Number(row.service_charge_amount), 0);
      const serviceChargeType = billConfigs.find((row) => row.service_charge_type)?.service_charge_type || null;
      const serviceChargeValue = billConfigs.find((row) => row.service_charge_type)?.service_charge_value ?? null;
      const serviceChargeTaxable = billConfigs.some((row) => row.service_charge_taxable === true);
      const openOrderItems = unbilled.rows.filter((order) => order.status !== "BILLED").flatMap((order) => (Array.isArray(order.items) ? order.items.map((item) => ({ ...item, order_id: order.id, order_number: order.order_number })) : []));
      res.json({ success: true, data: { sessionId: req.params.id, total: roundCurrency(billedTotal + unbilledTotal), amountPaid: roundCurrency(paid), remainingBalance: roundCurrency(Math.max(billedTotal - paid, 0) + unbilledTotal), serviceCharge: roundCurrency(serviceCharge), serviceChargeType, serviceChargeValue, serviceChargeTaxable, tips: Number(tips.rows[0]?.total || 0), items: [...items.rows, ...openOrderItems], saleItems: items.rows, sales: sales.rows, payments: payments.rows, openOrders: unbilled.rows } });
    } catch (error) { lifecycleError(res, error, "Unable to load hospitality bill"); }
  });

  router.post("/hospitality/sessions/:id/bill/split", authenticate, authorize("hospitality.bill.split"), async (req, res) => {
    const mode = String(req.body?.mode || "").toUpperCase();
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const session = await client.query(`SELECT id FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        const group = await client.query(`SELECT id FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND (id=$3 OR (status='MERGED' AND merged_into_session_id=$3))`, [req.user.companyId, storeId, req.params.id]);
        for (const groupedSession of group.rows) await ensureHospitalityBill(client, req, storeId, groupedSession.id);
        const linkedBill = await client.query(`SELECT b.id,b.service_charge_amount,b.service_charge_tax,bs.source_sale_id FROM hospitality_bills b
          JOIN hospitality_bill_sales bs ON bs.bill_id=b.id JOIN sales s ON s.id=bs.sale_id
          WHERE s.id=$1 AND b.company_id=$2 AND b.store_id=$3 AND b.session_id=ANY($4::uuid[]) AND b.status='OPEN' FOR UPDATE OF b,s`, [req.body?.saleId, req.user.companyId, storeId, group.rows.map((row) => row.id)]);
        if (!linkedBill.rows.length) throw Object.assign(new Error("Open hospitality bill sale not found"), { status: 404 });
        const sourceSaleId = String(req.body.saleId);
        const paid = await client.query("SELECT 1 FROM payments WHERE sale_id=$1 AND status='completed' LIMIT 1", [sourceSaleId]);
        if (paid.rows.length) throw Object.assign(new Error("A bill cannot be split after payments have been recorded"), { status: 409 });
        const sourceItems = await client.query(`SELECT si.* FROM sale_items si JOIN sales s ON s.id=si.sale_id
          WHERE si.sale_id=$1 AND s.company_id=$2 AND s.store_id=$3 ORDER BY si.id FOR UPDATE OF si`, [sourceSaleId, req.user.companyId, storeId]);
        const allocations = splitHospitalityLines(sourceItems.rows, { mode, selections: req.body?.selections, shares: req.body?.shares });
        const nonEmptyShares = allocations.map((share, index) => ({ share, index })).filter(({ share }) => share.length > 0);
        if (nonEmptyShares.length < 2 || (mode === "EQUAL" && nonEmptyShares.length !== allocations.length)) {
          throw Object.assign(new Error("Split must leave bill items in at least two non-empty portions"), { status: 400 });
        }
        const splitRow = await client.query(`INSERT INTO hospitality_bill_splits(bill_id,mode,shares,created_by)
          VALUES($1,$2,$3,$4) RETURNING id`, [linkedBill.rows[0].id, mode, nonEmptyShares.length, req.user.id]);
        const splitId = splitRow.rows[0].id;
        const saleIds = [];
        const saleIdByShare = new Map();
        saleIdByShare.set(nonEmptyShares[0].index, sourceSaleId);
        saleIds.push(sourceSaleId);
        for (const { index: shareIndex } of nonEmptyShares.slice(1)) {
          const child = await client.query(`INSERT INTO sales(company_id,store_id,user_id,customer_id,subtotal,tax,discount,total,status)
            SELECT company_id,store_id,$2,customer_id,0,0,0,0,'hospitality_open' FROM sales
            WHERE id=$1 AND company_id=$3 AND store_id=$4 RETURNING id`, [sourceSaleId, req.user.id, req.user.companyId, storeId]);
          if (!child.rows.length) throw Object.assign(new Error("Unable to create split sale"), { status: 409 });
          saleIdByShare.set(shareIndex, child.rows[0].id);
          saleIds.push(child.rows[0].id);
          await client.query("INSERT INTO hospitality_bill_sales(bill_id,sale_id,source_sale_id,split_mode) VALUES($1,$2,$3,$4)", [linkedBill.rows[0].id, child.rows[0].id, sourceSaleId, mode]);
        }
        for (const original of sourceItems.rows) {
          const sharesForItem = allocations.map((share) => share.find((line) => String(line.id) === String(original.id)) || null);
          const firstShare = sharesForItem.findIndex(Boolean);
          if (firstShare < 0) continue;
          const first = sharesForItem[firstShare];
          const originalModifiers = await client.query("SELECT modifier_option_id,quantity,unit_price,total FROM sale_item_modifiers WHERE sale_item_id=$1", [original.id]);
          const firstModifierRatio = Number(first.quantity) / Number(original.quantity);
          await client.query(`UPDATE sale_items SET sale_id=$2,quantity=$3,discount=$4,tax=$5,total=$6
            WHERE id=$1 AND sale_id=$7`, [original.id, saleIdByShare.get(firstShare), first.quantity, first.discount, first.tax, first.total, sourceSaleId]);
          if (firstModifierRatio !== 1) await client.query(`UPDATE sale_item_modifiers SET quantity=ROUND(quantity*$2,3),total=ROUND(total*$2,2) WHERE sale_item_id=$1`, [original.id, firstModifierRatio]);
          await client.query("INSERT INTO hospitality_bill_split_items(split_id,source_sale_item_id,split_sale_item_id,quantity) VALUES($1,$2,$3,$4)", [splitId, original.id, original.id, first.quantity]);
          for (let shareIndex = 0; shareIndex < sharesForItem.length; shareIndex += 1) {
            const part = sharesForItem[shareIndex];
            if (!part || shareIndex === firstShare) continue;
            const inserted = await client.query(`INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,discount,tax,total,item_type,discount_type,discount_value,original_unit_price,original_tax,original_total,discounted_by,modifier_data,bundle_components)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb) RETURNING id`, [saleIdByShare.get(shareIndex), original.product_id, original.product_name, part.quantity, original.unit_price, part.discount, part.tax, part.total, original.item_type, original.discount_type, original.discount_value, original.original_unit_price, original.original_tax, original.original_total, original.discounted_by, JSON.stringify(original.modifier_data || []), JSON.stringify(original.bundle_components || [])]);
            const modifierRatio = Number(part.quantity) / Number(original.quantity);
            for (const modifier of originalModifiers.rows) await client.query(`INSERT INTO sale_item_modifiers(sale_item_id,modifier_option_id,quantity,unit_price,total)
              VALUES($1,$2,$3,$4,$5)`, [inserted.rows[0].id, modifier.modifier_option_id, Math.round((Number(modifier.quantity) * modifierRatio + Number.EPSILON) * 1000) / 1000, modifier.unit_price, roundCurrency(Number(modifier.total) * modifierRatio)]);
            await client.query("INSERT INTO hospitality_bill_split_items(split_id,source_sale_item_id,split_sale_item_id,quantity) VALUES($1,$2,$3,$4)", [splitId, original.id, inserted.rows[0].id, part.quantity]);
          }
        }
        const isRootSale = !linkedBill.rows[0].source_sale_id;
        const chargeCents = Math.round(Number(linkedBill.rows[0].service_charge_amount) * 100);
        const chargeTaxCents = Math.round(Number(linkedBill.rows[0].service_charge_tax) * 100);
        for (const [saleIndex, saleId] of saleIds.entries()) {
          const shareCharge = mode === "EQUAL" && isRootSale ? (saleIndex === saleIds.length - 1 ? chargeCents - Math.floor(chargeCents / saleIds.length) * (saleIds.length - 1) : Math.floor(chargeCents / saleIds.length)) / 100 : saleId === sourceSaleId && isRootSale ? Number(linkedBill.rows[0].service_charge_amount) : 0;
          const shareTax = mode === "EQUAL" && isRootSale ? (saleIndex === saleIds.length - 1 ? chargeTaxCents - Math.floor(chargeTaxCents / saleIds.length) * (saleIds.length - 1) : Math.floor(chargeTaxCents / saleIds.length)) / 100 : saleId === sourceSaleId && isRootSale ? Number(linkedBill.rows[0].service_charge_tax) : 0;
          await refreshHospitalitySale(client, saleId, req.user.companyId, storeId, shareCharge, shareTax);
        }
        return { splitId, saleIds, mode, shares: nonEmptyShares.length };
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.bill.split", entityType: "hospitality_bill_split", entityId: result.splitId, metadata: { sessionId: req.params.id, saleIds: result.saleIds, mode: result.mode, shares: result.shares } });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      if (error.message?.startsWith("Split mode") || error.message?.startsWith("Equal split") || error.message?.startsWith("Select bill") || error.message?.startsWith("Select at least") || error.message?.startsWith("Selected item") || error.message?.startsWith("Selected quantity")) error.status = 400;
      lifecycleError(res, error, "Unable to split hospitality bill");
    }
  });

  router.put("/hospitality/sessions/:id/bill/service-charge", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const bill = await transact(async (client) => {
        const session = await client.query(`SELECT id FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        const currentBill = await ensureHospitalityBill(client, req, storeId, req.params.id);
        const billSales = await client.query(`SELECT bs.sale_id,bs.source_sale_id,s.subtotal,s.hospitality_service_charge_amount
          FROM hospitality_bill_sales bs JOIN sales s ON s.id=bs.sale_id WHERE bs.bill_id=$1 FOR UPDATE OF s`, [currentBill.id]);
        const payments = await client.query(`SELECT 1 FROM payments p JOIN hospitality_bill_sales bs ON bs.sale_id=p.sale_id
          WHERE bs.bill_id=$1 AND p.status='completed' LIMIT 1`, [currentBill.id]);
        if (payments.rows.length) throw Object.assign(new Error("Service charge cannot change after a bill payment"), { status: 409 });
        const itemsSubtotal = billSales.rows.reduce((sum, row) => sum + Number(row.subtotal) - Number(row.hospitality_service_charge_amount), 0);
        const settings = await client.query("SELECT vat_enabled,default_vat_rate FROM company_settings WHERE company_id=$1", [req.user.companyId]);
        const taxable = req.body?.taxable === true;
        const charge = calculateHospitalityServiceCharge({ subtotal: itemsSubtotal, type: req.body?.type, value: req.body?.value, taxable, vatEnabled: settings.rows[0]?.vat_enabled !== false, vatRate: Number(settings.rows[0]?.default_vat_rate ?? 20) });
        const updated = await client.query(`UPDATE hospitality_bills SET service_charge_type=$2,service_charge_value=$3,
          service_charge_amount=$4,service_charge_taxable=$5,service_charge_tax=$6,updated_at=NOW()
          WHERE id=$1 AND company_id=$7 AND store_id=$8 RETURNING *`, [currentBill.id, charge.type, charge.value, charge.amount, taxable, charge.tax, req.user.companyId, storeId]);
        const root = billSales.rows.find((row) => !row.source_sale_id) || billSales.rows[0];
        for (const row of billSales.rows) await refreshHospitalitySale(client, row.sale_id, req.user.companyId, storeId, row.sale_id === root?.sale_id ? charge.amount : 0, row.sale_id === root?.sale_id ? charge.tax : 0);
        return updated.rows[0];
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.service_charge.set", entityType: "hospitality_bill", entityId: bill.id, metadata: { type: bill.service_charge_type, value: bill.service_charge_value, amount: bill.service_charge_amount, taxable: bill.service_charge_taxable, tax: bill.service_charge_tax } });
      res.json({ success: true, data: bill });
    } catch (error) {
      if (error.message?.startsWith("Service charge")) error.status = 400;
      lifecycleError(res, error, "Unable to set hospitality service charge");
    }
  });

  router.delete("/hospitality/sessions/:id/bill/service-charge", authenticate, authorize("hospitality.service_charge.override"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const bill = await transact(async (client) => {
        const session = await client.query(`SELECT id FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        const currentBill = await ensureHospitalityBill(client, req, storeId, req.params.id);
        const payments = await client.query(`SELECT 1 FROM payments p JOIN hospitality_bill_sales bs ON bs.sale_id=p.sale_id
          WHERE bs.bill_id=$1 AND p.status='completed' LIMIT 1`, [currentBill.id]);
        if (payments.rows.length) throw Object.assign(new Error("Service charge cannot be removed after a bill payment"), { status: 409 });
        const sales = await client.query(`SELECT bs.sale_id,bs.source_sale_id FROM hospitality_bill_sales bs WHERE bs.bill_id=$1 FOR UPDATE`, [currentBill.id]);
        const updated = await client.query(`UPDATE hospitality_bills SET service_charge_type=NULL,service_charge_value=0,
          service_charge_amount=0,service_charge_taxable=false,service_charge_tax=0,updated_at=NOW()
          WHERE id=$1 AND company_id=$2 AND store_id=$3 RETURNING *`, [currentBill.id, req.user.companyId, storeId]);
        for (const row of sales.rows) await refreshHospitalitySale(client, row.sale_id, req.user.companyId, storeId);
        return updated.rows[0];
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.service_charge.removed", entityType: "hospitality_bill", entityId: bill.id, metadata: {} });
      res.json({ success: true, data: bill });
    } catch (error) { lifecycleError(res, error, "Unable to remove hospitality service charge"); }
  });

  router.post("/hospitality/sessions/:id/bill/payments", authenticate, authorize("hospitality.bill.pay"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const session = await client.query(`SELECT * FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        const group = await client.query(`SELECT id FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND (id=$3 OR (status='MERGED' AND merged_into_session_id=$3)) FOR UPDATE`, [req.user.companyId, storeId, req.params.id]);
        for (const groupedSession of group.rows) await ensureHospitalityBill(client, req, storeId, groupedSession.id);
        const billSales = await getHospitalityBillSales(client, req.user.companyId, storeId, group.rows.map((row) => row.id));
        if (!billSales.rows.length) throw Object.assign(new Error("There are no billable items on this hospitality session"), { status: 409 });
        const balance = roundCurrency(billSales.rows.reduce((sum, row) => sum + Math.max(Number(row.total) - Number(row.amount_paid), 0), 0));
        const payment = validateHospitalityPayment({ amount: req.body?.amount, balance, tip: req.body?.tip ?? 0 });
        const paymentMethod = String(req.body?.paymentMethod || "").trim().toLowerCase();
        const allowedMethods = await getAllowedPaymentMethodCodes((sql, params) => client.query(sql, params), req.user.companyId);
        if (!allowedMethods.includes(paymentMethod)) throw Object.assign(new Error("Payment method is not enabled for this company"), { status: 400 });
        let giftCard = null;
        let creditCustomer = null;
        if (paymentMethod === "gift_card") {
          const normalizedCode = normaliseGiftCardCode(req.body?.giftCardCode);
          if (!normalizedCode) throw Object.assign(new Error("Gift card code is required"), { status: 400 });
          const card = await client.query(`SELECT * FROM gift_cards WHERE company_id=$1 AND UPPER(REPLACE(REPLACE(code,'-',''),' ',''))=$2 FOR UPDATE`, [req.user.companyId, normalizedCode]);
          const eligibility = isCardRedeemable(card.rows[0]);
          if (!eligibility.ok) throw Object.assign(new Error(eligibility.reason), { status: 409 });
          const cardBalance = await client.query(`SELECT COALESCE(SUM(CASE transaction_type WHEN 'redeem' THEN -amount ELSE amount END),0)::numeric AS balance
            FROM gift_card_ledger WHERE gift_card_id=$1 AND company_id=$2`, [card.rows[0].id, req.user.companyId]);
          const redemption = validateRedemption(cardBalance.rows[0]?.balance, payment.amount);
          if (!redemption.ok) throw Object.assign(new Error(redemption.reason), { status: 409 });
          giftCard = { id: card.rows[0].id, balance: Number(cardBalance.rows[0].balance) };
        }
        if (paymentMethod === "customer_credit") {
          const customerId = session.rows[0].customer_id;
          if (!customerId) throw Object.assign(new Error("A customer is required for customer-credit payments"), { status: 400 });
          const customer = await client.query("SELECT credit_enabled,credit_limit FROM customers WHERE id=$1 AND company_id=$2 FOR UPDATE", [customerId, req.user.companyId]);
          if (!customer.rows.length || customer.rows[0].credit_enabled !== true) throw Object.assign(new Error("Customer credit is not enabled"), { status: 409 });
          const currentCredit = await client.query(`SELECT COALESCE(SUM(amount*CASE WHEN transaction_type IN ('payment','debit_note') THEN -1 ELSE 1 END),0)::numeric AS outstanding
            FROM customer_ledger WHERE company_id=$1 AND customer_id=$2`, [req.user.companyId, customerId]);
          const available = customer.rows[0].credit_limit == null ? Infinity : Number(customer.rows[0].credit_limit) - Number(currentCredit.rows[0].outstanding);
          if (payment.amount > available) throw Object.assign(new Error("Customer credit limit would be exceeded"), { status: 409 });
          creditCustomer = customerId;
        }
        let remainingPayment = payment.amount;
        const insertedPayments = [];
        for (const row of billSales.rows) {
          if (remainingPayment <= 0) break;
          const due = roundCurrency(Math.max(Number(row.total) - Number(row.amount_paid), 0));
          if (due <= 0) continue;
          const applied = roundCurrency(Math.min(due, remainingPayment));
          const inserted = await client.query(`INSERT INTO payments(sale_id,company_id,store_id,customer_id,transaction_id,direction,reference,payment_method,amount,status)
            SELECT s.id,s.company_id,s.store_id,s.customer_id,s.id,'IN',s.receipt_number,$4,$5,'completed'
            FROM sales s WHERE s.id=$1 AND s.company_id=$2 AND s.store_id=$3 RETURNING id,sale_id,amount`, [row.sale_id, req.user.companyId, storeId, paymentMethod, applied]);
          if (!inserted.rows.length) throw Object.assign(new Error("Hospitality sale is outside the current company/store"), { status: 404 });
          insertedPayments.push({ ...inserted.rows[0], amount: applied, saleId: row.sale_id });
          if (creditCustomer) await client.query(`INSERT INTO customer_ledger(company_id,store_id,customer_id,transaction_type,amount,reference_type,reference_id,description,gross_amount,created_by)
            VALUES($1,$2,$3,'credit_sale',$4,'sale',$5,'Hospitality customer-credit payment',$4,$6)`, [req.user.companyId, storeId, creditCustomer, applied, row.sale_id, req.user.id]);
          remainingPayment = roundCurrency(remainingPayment - applied);
        }
        if (remainingPayment > 0) throw Object.assign(new Error("Payment could not be allocated to the remaining bill"), { status: 409 });
        if (giftCard) {
          let cardBalance = giftCard.balance;
          for (const inserted of insertedPayments) {
            cardBalance = roundCurrency(cardBalance - inserted.amount);
            await client.query(`INSERT INTO gift_card_ledger(company_id,gift_card_id,transaction_type,amount,balance_after,reference_type,reference_id,description,store_id,created_by)
              VALUES($1,$2,'redeem',$3,$4,'hospitality_payment',$5,'Hospitality bill payment',$6,$7)`, [req.user.companyId, giftCard.id, inserted.amount, cardBalance, inserted.id, storeId, req.user.id]);
            await client.query("UPDATE payments SET provider_transaction_id=$1 WHERE id=$2", [`giftcard:${giftCard.id}`, inserted.id]);
          }
        }
        if (payment.tip > 0) await client.query(`INSERT INTO hospitality_tips(company_id,store_id,bill_id,session_id,payment_id,amount,created_by)
          VALUES($1,$2,$3,$4,$5,$6,$7)`, [req.user.companyId, storeId, billSales.rows[0].bill_id, req.params.id, insertedPayments[0].id, payment.tip, req.user.id]);
        const amountPaid = roundCurrency(billSales.rows.reduce((sum, row) => sum + Number(row.amount_paid), 0) + payment.amount);
        const remainingBalance = roundCurrency(balance - payment.amount);
        if (remainingBalance === 0) {
          const saleIds = billSales.rows.map((row) => row.sale_id);
          for (const saleId of saleIds) {
            await client.query("UPDATE sales SET status='completed',completed_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [saleId, req.user.companyId, storeId]);
            await syncCanonicalSaleTransaction(client, { saleId, companyId: req.user.companyId, storeId, transactionType: "SALE" });
          }
          await client.query("UPDATE hospitality_bills SET status='PAID',updated_at=NOW() WHERE session_id=ANY($1::uuid[]) AND company_id=$2 AND store_id=$3 AND status='OPEN'", [group.rows.map((row) => row.id), req.user.companyId, storeId]);
          await client.query("UPDATE hospitality_qr_orders SET payment_status='PAID' WHERE session_id=ANY($1::uuid[]) AND company_id=$2 AND store_id=$3 AND status='BILLED'", [group.rows.map((row) => row.id), req.user.companyId, storeId]);
        }
        return { amount: payment.amount, tip: payment.tip, amountPaid, remainingBalance, paid: remainingBalance === 0, paymentIds: insertedPayments.map((row) => row.id) };
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.bill.payment_added", entityType: "hospitality_table_session", entityId: req.params.id, metadata: { amount: result.amount, tip: result.tip, remainingBalance: result.remainingBalance, paymentIds: result.paymentIds } });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      if (error.message?.startsWith("Payment amount") || error.message?.startsWith("Payment cannot") || error.message?.startsWith("Tip must")) error.status = 400;
      lifecycleError(res, error, "Unable to record hospitality payment");
    }
  });

  router.put("/hospitality/sessions/:id/orders/:orderId/items", authenticate, authorize("hospitality.kds.manage"), async (req, res) => {
    const action = String(req.body?.action || "").toUpperCase();
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const session = await client.query(`SELECT id FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        const group = await client.query(`SELECT id FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND (id=$3 OR (status='MERGED' AND merged_into_session_id=$3))`, [req.user.companyId, storeId, req.params.id]);
        const order = await client.query(`SELECT id,order_number,items FROM hospitality_qr_orders WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND session_id=ANY($4::uuid[]) AND status<>'CANCELLED' FOR UPDATE`, [req.params.orderId, req.user.companyId, storeId, group.rows.map((row) => row.id)]);
        if (!order.rows.length) throw Object.assign(new Error("Hospitality order not found"), { status: 404 });
        const orderItems = Array.isArray(order.rows[0].items) ? order.rows[0].items : [];
        let lineIds = Array.isArray(req.body?.lineIds) ? req.body.lineIds.map(String) : [];
        if (!lineIds.length && typeof req.body?.course === "string") lineIds = orderItems.filter((item) => item.course === req.body.course && (action !== "HOLD" || !item.fired_at)).map((item) => item.line_id);
        const updatedItems = updateHospitalityItems(orderItems, { lineIds, action, course: req.body?.course, sequence: req.body?.sequence });
        await client.query("UPDATE hospitality_qr_orders SET items=$2::jsonb WHERE id=$1 AND company_id=$3 AND store_id=$4", [order.rows[0].id, JSON.stringify(updatedItems), req.user.companyId, storeId]);
        if (action === "COURSE") {
          const tickets = await client.query("SELECT id,items FROM hospitality_kds_tickets WHERE company_id=$1 AND store_id=$2 AND order_number=$3 FOR UPDATE", [req.user.companyId, storeId, order.rows[0].order_number]);
          for (const ticket of tickets.rows) {
            const ticketItems = updateHospitalityItems(Array.isArray(ticket.items) ? ticket.items : [], { lineIds, action, course: req.body?.course, sequence: req.body?.sequence });
            await client.query("UPDATE hospitality_kds_tickets SET items=$2::jsonb,updated_at=NOW() WHERE id=$1 AND company_id=$3 AND store_id=$4", [ticket.id, JSON.stringify(ticketItems), req.user.companyId, storeId]);
          }
        }
        return { orderId: order.rows[0].id, lineIds, items: updatedItems };
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: action === "HOLD" ? "hospitality.items.held" : "hospitality.items.course_assigned", entityType: "hospitality_qr_order", entityId: result.orderId, metadata: { lineIds: result.lineIds, course: req.body?.course || null, sequence: req.body?.sequence || null } });
      res.json({ success: true, data: result });
    } catch (error) {
      if (error.message?.startsWith("Select at least") || error.message?.startsWith("Only held") || error.message?.startsWith("An item") || error.message?.startsWith("Course") || error.message?.startsWith("Invalid course")) error.status = 400;
      lifecycleError(res, error, "Unable to update hospitality order items");
    }
  });

  router.post("/hospitality/sessions/:id/orders/:orderId/fire", authenticate, authorize("hospitality.kds.manage"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId ?? req.user?.storeId);
      const result = await transact(async (client) => {
        const session = await client.query(`SELECT id FROM hospitality_table_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED') FOR UPDATE`, [req.params.id, req.user.companyId, storeId]);
        if (!session.rows.length) throw Object.assign(new Error("Active hospitality session not found"), { status: 404 });
        const group = await client.query(`SELECT id FROM hospitality_table_sessions WHERE company_id=$1 AND store_id=$2
          AND (id=$3 OR (status='MERGED' AND merged_into_session_id=$3))`, [req.user.companyId, storeId, req.params.id]);
        const order = await client.query(`SELECT id,table_id,order_number,items FROM hospitality_qr_orders WHERE id=$1 AND company_id=$2 AND store_id=$3
          AND session_id=ANY($4::uuid[]) AND status<>'CANCELLED' FOR UPDATE`, [req.params.orderId, req.user.companyId, storeId, group.rows.map((row) => row.id)]);
        if (!order.rows.length) throw Object.assign(new Error("Hospitality order not found"), { status: 404 });
        const orderItems = Array.isArray(order.rows[0].items) ? order.rows[0].items : [];
        const lineIds = Array.isArray(req.body?.lineIds) ? req.body.lineIds.map(String) : typeof req.body?.course === "string" ? orderItems.filter((item) => item.course === req.body.course && item.held && !item.fired_at).map((item) => item.line_id) : [];
        const updatedItems = updateHospitalityItems(orderItems, { lineIds, action: "FIRE" });
        const firedItems = updatedItems.filter((item) => lineIds.includes(String(item.line_id)));
        await client.query("UPDATE hospitality_qr_orders SET items=$2::jsonb WHERE id=$1 AND company_id=$3 AND store_id=$4", [order.rows[0].id, JSON.stringify(updatedItems), req.user.companyId, storeId]);
        const ticket = await client.query(`INSERT INTO hospitality_kds_tickets(company_id,store_id,table_id,session_id,order_number,items,notes)
          SELECT $1,$2,$3,$4,$5,$6::jsonb,$7 RETURNING id,status,items,created_at`, [req.user.companyId, storeId, order.rows[0].table_id, req.params.id, order.rows[0].order_number, JSON.stringify(firedItems), req.body?.notes || null]);
        return { orderId: order.rows[0].id, ticket: ticket.rows[0], lineIds };
      });
      await writeAudit.object({ companyId: req.user.companyId, userId: req.user.id, storeId, action: "hospitality.items.fired", entityType: "hospitality_qr_order", entityId: result.orderId, metadata: { lineIds: result.lineIds, ticketId: result.ticket.id } });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      if (error.message?.startsWith("Select at least") || error.message?.startsWith("Only held") || error.message?.startsWith("An item")) error.status = 400;
      lifecycleError(res, error, "Unable to fire hospitality items");
    }
  });

  router.post("/hospitality/tables/:id/qr-session", authenticate, authorize("hospitality.tables.manage"), async (req, res) => {
    try {
      const table = await db("SELECT id,store_id FROM hospitality_tables WHERE id=$1 AND company_id=$2 AND active=true", [req.params.id, req.user.companyId]);
      if (!table.rows.length) return res.status(404).json({ success: false, message: "Table not found" });
      const storeId = await resolveStoreId(req, table.rows[0].store_id, table.rows[0].store_id);
      if (storeId !== table.rows[0].store_id && !canAccessStore) {
        return res.status(403).json({ success: false, message: "You do not have access to this store" });
      }
      const token = crypto.randomBytes(32).toString("base64url");
      const hash = crypto.createHash("sha256").update(token).digest("hex");
      await db("UPDATE hospitality_qr_sessions SET active=false WHERE company_id=$1 AND table_id=$2 AND active=true", [req.user.companyId, req.params.id]);
      await db("INSERT INTO hospitality_qr_sessions(company_id,store_id,table_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5)", [req.user.companyId, table.rows[0].store_id, req.params.id, hash, req.body?.expiresAt || null]);
      res.status(201).json({ success: true, data: { token, path: `/table-order/${token}` } });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("QR session error:", error); res.status(500).json({ success: false, message: "Unable to create table QR session" });
    }
  });

  router.get("/hospitality/public/qr/:token", async (req, res) => {
    try {
      const hash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const session = await db(`SELECT q.company_id,q.store_id,COALESCE(parent.table_id,original_table.id) AS table_id,t.table_number,t.name AS table_name
        FROM hospitality_qr_sessions q JOIN hospitality_tables original_table ON original_table.id=q.table_id
        LEFT JOIN hospitality_table_sessions source ON source.company_id=q.company_id AND source.store_id=q.store_id AND source.table_id=q.table_id AND source.status='MERGED'
        LEFT JOIN hospitality_table_sessions parent ON parent.id=source.merged_into_session_id
        JOIN hospitality_tables t ON t.id=COALESCE(parent.table_id,original_table.id)
        WHERE q.token_hash=$1 AND q.active=true AND (q.expires_at IS NULL OR q.expires_at>NOW())`, [hash]);
      if (!session.rows.length) return res.status(404).json({ success: false, message: "This table-order link is no longer active" });
      const ctx=session.rows[0];
      const products=await db("SELECT id,name,description,price,image_url FROM products WHERE company_id=$1 AND active=true ORDER BY name",[ctx.company_id]);
      res.json({success:true,data:{table:{id:ctx.table_id,number:ctx.table_number,name:ctx.table_name},products:products.rows}});
    } catch(error){ console.error("QR menu error:",error); res.status(500).json({success:false,message:"Unable to load menu"}); }
  });

  router.get("/hospitality/public/qr/:token/bill", async (req, res) => {
    try {
      const context = await getPublicQrContext(req.params.token, req.user);
      if (!context) return res.status(404).json({ success: false, message: "This table-order link is no longer active" });
      if (hasConflictingPublicIds(req, context)) return res.status(403).json({ success: false, message: "The supplied hospitality identifiers do not match this QR session" });
      const billRows = Array.isArray(context.bill) ? context.bill : [];
      if (!billRows.length || billRows.some((row) => row.bill_status !== "OPEN")) return res.status(409).json({ success: false, message: "No open bill is available for payment" });
      const subtotal = billRows.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
      const tax = billRows.reduce((sum, row) => sum + Number(row.tax || 0), 0);
      const discount = billRows.reduce((sum, row) => sum + Number(row.discount || 0), 0);
      const serviceCharge = billRows.reduce((sum, row) => sum + Number(row.service_charge_amount || 0), 0);
      const amountPaid = billRows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
      const total = roundCurrency(billRows.reduce((sum, row) => sum + Number(row.total || 0), 0));
      const remainingBalance = roundCurrency(billRows.reduce((sum, row) => sum + Math.max(Number(row.total || 0) - Number(row.amount_paid || 0), 0), 0));
      const paymentAvailability = await getPublicPaymentAvailability(context.company_id);
      const items = await db(`SELECT si.product_name AS name, si.quantity, si.unit_price, si.discount, si.tax, si.total
        FROM sale_items si WHERE si.sale_id=ANY($1::uuid[]) ORDER BY si.id`, [billRows.map((row) => row.sale_id)]);
      const tipTotal = await db(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM hospitality_tips WHERE company_id=$1 AND store_id=$2 AND session_id=$3`, [context.company_id, context.store_id, context.session_id]);
      const balance = {
        subtotal: roundCurrency(subtotal),
        discounts: roundCurrency(discount),
        serviceCharge: roundCurrency(serviceCharge),
        tax: roundCurrency(tax),
        total,
        tips: roundCurrency(Number(tipTotal.rows[0]?.total || 0)),
        amountPaid: roundCurrency(amountPaid),
        remainingBalance,
      };
      res.json({ success: true, data: {
        table: { number: context.table_number || `Table ${context.table_id}`, name: context.table_name || null },
        items: items.rows.map((row) => ({ name: row.name, quantity: Number(row.quantity), unit_price: Number(row.unit_price), discount: Number(row.discount || 0), tax: Number(row.tax || 0), total: Number(row.total || 0) })),
        balance,
        paymentAvailable: paymentAvailability.methods.length > 0,
        paymentMethods: paymentAvailability.methods,
        providerConfigured: paymentAvailability.hasProvider,
      }});
    } catch (error) {
      console.error("QR bill lookup error:", error);
      res.status(500).json({ success: false, message: "Unable to load the current bill" });
    }
  });

  router.get("/hospitality/public/qr/:token/pay", async (req, res) => {
    return router.handle({ method: "GET", url: `/hospitality/public/qr/${encodeURIComponent(req.params.token)}/bill`, headers: req.headers, query: req.query, body: req.body, user: req.user, get: req.get.bind(req), accepts: req.accepts.bind(req), params: req.params }, res);
  });

  router.post("/hospitality/public/qr/:token/payments", async (req, res) => {
    try {
      const publicToken = req.params.token;
      const context = await getPublicQrContext(publicToken, req.user);
      if (!context || !context.session_id) return res.status(404).json({ success: false, message: "This table-order link is no longer active" });
      await req.ensureBusinessCommandRun?.({ companyId: context.company_id, userId: null, storeId: context.store_id });
      if (hasConflictingPublicIds(req, context)) return res.status(403).json({ success: false, message: "The supplied hospitality identifiers do not match this QR session" });
      if (!context.bill || !context.bill.length) return res.status(409).json({ success: false, message: "No open bill is available for payment" });
      const billRows = context.bill;
      const subtotal = billRows.reduce((sum, row) => sum + Number(row.subtotal || 0), 0);
      const tax = billRows.reduce((sum, row) => sum + Number(row.tax || 0), 0);
      const serviceCharge = billRows.reduce((sum, row) => sum + Number(row.service_charge_amount || 0), 0);
      const discount = billRows.reduce((sum, row) => sum + Number(row.discount || 0), 0);
      const amountPaid = billRows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0);
      const remainingBalance = roundCurrency(billRows.reduce((sum, row) => sum + Math.max(Number(row.total || 0) - Number(row.amount_paid || 0), 0), 0));
      const paymentMethod = String(req.body?.paymentMethod || "cash").trim().toLowerCase();
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, message: "A positive payment amount is required" });
      const rawIdempotencyKey = String(req.body?.idempotencyKey ?? req.body?.clientRequestId ?? req.headers["idempotency-key"] ?? req.headers["x-idempotency-key"] ?? "").trim();
      if (!rawIdempotencyKey) return res.status(400).json({ success: false, message: "A valid idempotency key is required" });
      const requestId = rawIdempotencyKey;
      const paymentLookupParams = [context.company_id, context.store_id, billRows.map((row) => row.sale_id), requestId];
      const existing = await findPublicQrPayment(db, paymentLookupParams);
      if (existing) {
        if (Number(existing.amount) !== amount || String(existing.payment_method).toLowerCase() !== paymentMethod) {
          return res.status(409).json({ success: false, message: "Idempotency key was already used for a different payment request" });
        }
        const response = { amount: Number(existing.amount), remainingBalance: roundCurrency(Math.max(remainingBalance - Number(existing.amount), 0)), status: existing.status === "completed" ? "PAID" : existing.status, idempotent: true, paymentMethod: existing.payment_method };
        return res.status(201).json({ success: true, data: response });
      }
      if (!["OPEN", "ORDERING", "SERVED", "CHECK_REQUESTED"].includes(String(context.session_status || "").toUpperCase())) {
        return res.status(409).json({ success: false, message: "This session is no longer payable" });
      }
      if (billRows.some((row) => row.bill_status !== "OPEN")) return res.status(409).json({ success: false, message: "No open bill is available for payment" });
      if (amount > remainingBalance) return res.status(409).json({ success: false, message: "Payment amount exceeds the remaining balance" });
      const methodList = await getAllowedPaymentMethodCodes(db, context.company_id);
      if (!methodList.includes(paymentMethod)) return res.status(409).json({ success: false, message: "This payment method is not enabled for customer payment" });
      const providerRows = await db(`SELECT id FROM integration_connections WHERE company_id=$1 AND enabled=true AND provider_name IS NOT NULL AND TRIM(provider_name)<>'' LIMIT 1`, [context.company_id]);
      const requiresProvider = ["card", "online", "bank_transfer", "voucher"].includes(paymentMethod);
      if (requiresProvider && !providerRows.rows.length) return res.status(409).json({ success: false, message: "Customer payment is unavailable because no payment provider is configured" });
      const saleId = billRows[0]?.sale_id || null;
      if (!saleId) throw Object.assign(new Error("No open bill is available for payment"), { status: 409 });
      const result = await transact(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${context.company_id}:${context.store_id}:${context.session_id}`]);
        const transactionExisting = await findPublicQrPayment((sql, params) => client.query(sql, params), paymentLookupParams);
        if (transactionExisting) {
          if (Number(transactionExisting.amount) !== amount || String(transactionExisting.payment_method).toLowerCase() !== paymentMethod) {
            throw Object.assign(new Error("Idempotency key was already used for a different payment request"), { status: 409 });
          }
          return { existingPayment: transactionExisting };
        }
        const currentBills = await client.query(publicQrBillSalesSql, [context.company_id, context.store_id, context.session_id]);
        if (!currentBills.rows.length || currentBills.rows.some((row) => row.bill_status !== "OPEN")) {
          throw Object.assign(new Error("No open bill is available for payment"), { status: 409 });
        }
        const currentBalance = roundCurrency(currentBills.rows.reduce((sum, row) => sum + Math.max(Number(row.total || 0) - Number(row.amount_paid || 0), 0), 0));
        if (amount > currentBalance) throw Object.assign(new Error("Payment amount exceeds the remaining balance"), { status: 409 });
        let unallocated = amount;
        const insertedPayments = [];
        for (const row of currentBills.rows) {
          if (unallocated <= 0) break;
          const due = roundCurrency(Math.max(Number(row.total || 0) - Number(row.amount_paid || 0), 0));
          if (due <= 0) continue;
          const applied = roundCurrency(Math.min(due, unallocated));
          const inserted = await client.query(`INSERT INTO payments(sale_id,company_id,store_id,customer_id,transaction_id,direction,reference,payment_method,amount,status)
            SELECT s.id,s.company_id,s.store_id,s.customer_id,s.id,'IN',$4,$6,$5,'completed'
            FROM sales s WHERE s.id=$1 AND s.company_id=$2 AND s.store_id=$3 RETURNING id,sale_id,amount,payment_method,status`, [row.sale_id, context.company_id, context.store_id, requestId, applied, paymentMethod]);
          if (!inserted.rows.length) throw Object.assign(new Error("Hospitality sale is outside the current company/store"), { status: 404 });
          insertedPayments.push(inserted.rows[0]);
          unallocated = roundCurrency(unallocated - applied);
        }
        if (unallocated > 0) throw Object.assign(new Error("Payment could not be allocated to the remaining bill"), { status: 409 });
        const remaining = roundCurrency(Math.max(currentBalance - amount, 0));
        if (remaining === 0) {
          for (const saleId of [...new Set(currentBills.rows.map((row) => row.sale_id))]) {
            await client.query("UPDATE sales SET status='completed', completed_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3", [saleId, context.company_id, context.store_id]);
            await syncCanonicalSaleTransaction(client, { saleId, companyId: context.company_id, storeId: context.store_id, transactionType: "SALE" });
          }
          await client.query("UPDATE hospitality_bills SET status='PAID',updated_at=NOW() WHERE company_id=$1 AND store_id=$2 AND session_id=$3 AND status='OPEN'", [context.company_id, context.store_id, context.session_id]);
          await client.query("UPDATE hospitality_qr_orders SET payment_status='PAID' WHERE company_id=$1 AND store_id=$2 AND session_id=$3 AND status='BILLED'", [context.company_id, context.store_id, context.session_id]);
        }
        return { inserted: insertedPayments[0], remainingBalance: remaining, paid: remaining === 0, status: remaining === 0 ? "PAID" : "PARTIAL" };
      });
      if (result.existingPayment) {
        const payment = result.existingPayment;
        const response = { amount: Number(payment.amount ?? amount), remainingBalance: roundCurrency(Math.max(remainingBalance - Number(payment.amount ?? amount), 0)), status: payment.status === "completed" ? "PAID" : (payment.status || "PARTIAL"), idempotent: true, paymentMethod: payment.payment_method || paymentMethod };
        return res.status(201).json({ success: true, data: response });
      }
      await writeAudit.object({ companyId: context.company_id, userId: null, storeId: context.store_id, action: "hospitality.qr.payment", entityType: "hospitality_table_session", entityId: context.session_id, metadata: { amount, paymentMethod, remainingBalance: result.remainingBalance, status: result.status, source: "qr_customer" } });
      const response = { amount, remainingBalance: result.remainingBalance, status: result.status, paid: result.paid, idempotent: false, paymentMethod: result.inserted.payment_method };
      res.status(201).json({ success: true, data: response });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      console.error("QR payment error:", error);
      res.status(500).json({ success: false, message: "Unable to record the customer payment" });
    }
  });

  router.post("/hospitality/public/qr/:token/pay", async (req, res) => {
    return router.handle({ method: "POST", url: `/hospitality/public/qr/${encodeURIComponent(req.params.token)}/payments`, headers: req.headers, query: req.query, body: req.body, user: req.user, get: req.get.bind(req), accepts: req.accepts.bind(req), params: req.params, ensureBusinessCommandRun: req.ensureBusinessCommandRun, businessCommandCorrelationId: req.businessCommandCorrelationId, businessCommandRunId: req.businessCommandRunId }, res);
  });

  router.post("/hospitality/public/qr/:token/orders", async (req,res)=>{
    try{
      const requested=validateQrOrderItems(req.body?.items);
      const hash=crypto.createHash("sha256").update(req.params.token).digest("hex");
      const session=await db(`SELECT q.company_id,q.store_id,COALESCE(parent.table_id,original_table.id) AS table_id,t.table_number
        FROM hospitality_qr_sessions q JOIN hospitality_tables original_table ON original_table.id=q.table_id
        LEFT JOIN hospitality_table_sessions source ON source.company_id=q.company_id AND source.store_id=q.store_id AND source.table_id=q.table_id AND source.status='MERGED'
        LEFT JOIN hospitality_table_sessions parent ON parent.id=source.merged_into_session_id
        JOIN hospitality_tables t ON t.id=COALESCE(parent.table_id,original_table.id)
        WHERE q.token_hash=$1 AND q.active=true AND (q.expires_at IS NULL OR q.expires_at>NOW())`,[hash]);
      if(!session.rows.length)return res.status(404).json({success:false,message:"This table-order link is no longer active"});
      const ctx=session.rows[0];
      await req.ensureBusinessCommandRun?.({ companyId: ctx.company_id, userId: null, storeId: ctx.store_id });
      const ids=requested.map(x=>x.productId);
      const products=await db("SELECT id,name,price,vat_rate,vat_applicable FROM products WHERE company_id=$1 AND active=true AND id=ANY($2::uuid[])",[ctx.company_id,ids]);
      const byId=new Map(products.rows.map(x=>[String(x.id),x]));
      if(byId.size!==new Set(ids).size)return res.status(400).json({success:false,message:"One or more menu items are unavailable"});
      const settings=await db("SELECT vat_enabled,default_vat_rate FROM company_settings WHERE company_id=$1",[ctx.company_id]);
      const vatEnabled=settings.rows[0]?.vat_enabled!==false;
      const firedAt=new Date().toISOString();
      const items=requested.map(x=>{const product=byId.get(x.productId),rate=Number(product.vat_rate||0),taxable=product.vat_applicable!==false;return {line_id:x.lineId,product_id:x.productId,name:product.name,quantity:x.quantity,unit_price:Number(product.price),vat_rate:rate,vat_applicable:taxable,tax:0,notes:x.notes,course:x.course,course_sequence:x.courseSequence,held:x.held,fired_at:x.held?null:firedAt};});
      const totals=computeBasketTotals(items.map(item=>({price:item.unit_price,quantity:item.quantity,vatRate:item.vat_rate,vatApplicable:item.vat_applicable})),{vatEnabled,vatRate:Number(settings.rows[0]?.default_vat_rate||20)});
      const lastTaxableIndex=items.reduce((last,item,index)=>vatEnabled&&item.vat_applicable?index:last,-1);
      let allocatedTax=0;
      for(const [index,item] of items.entries()){const lineTax=vatEnabled&&item.vat_applicable?roundCurrency(item.unit_price*item.quantity*item.vat_rate/100):0;item.tax=index===lastTaxableIndex?roundCurrency(totals.vat-allocatedTax):lineTax;allocatedTax=roundCurrency(allocatedTax+item.tax);}
      const subtotal=roundCurrency(totals.subtotal),tax=roundCurrency(totals.vat),total=roundCurrency(totals.total);
      const orderNumber=`QR-${Date.now().toString(36).toUpperCase()}`;
      const mode=req.body?.paymentMode==="CARD"?"CARD":"PAY_AT_TILL";
      const order=await transact(async(client)=>{
        const tableSession=await client.query(`INSERT INTO hospitality_table_sessions(company_id,store_id,table_id,status)
          VALUES($1,$2,$3,'ORDERING') ON CONFLICT (company_id,store_id,table_id)
          WHERE status IN ('OPEN','ORDERING','SERVED','CHECK_REQUESTED')
          DO UPDATE SET status='ORDERING',updated_at=NOW() RETURNING id`,[ctx.company_id,ctx.store_id,ctx.table_id]);
        const sessionId=tableSession.rows[0].id;
        const inserted=await client.query("INSERT INTO hospitality_qr_orders(company_id,store_id,table_id,session_id,order_number,items,subtotal,tax,total,payment_mode) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) RETURNING *",[ctx.company_id,ctx.store_id,ctx.table_id,sessionId,orderNumber,JSON.stringify(items),subtotal,tax,total,mode]);
        const firedItems=items.filter((item)=>!item.held);
        if(firedItems.length) await client.query("INSERT INTO hospitality_kds_tickets(company_id,store_id,table_id,session_id,order_number,items,notes) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",[ctx.company_id,ctx.store_id,ctx.table_id,sessionId,orderNumber,JSON.stringify(firedItems),req.body?.notes||null]);
        await client.query("UPDATE hospitality_tables SET status='OCCUPIED',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$3",[ctx.table_id,ctx.company_id,ctx.store_id]);
        const openBill=await client.query("SELECT * FROM hospitality_bills WHERE company_id=$1 AND store_id=$2 AND session_id=$3 AND status='OPEN' FOR UPDATE",[ctx.company_id,ctx.store_id,sessionId]);
        if(openBill.rows.length){
          const actor={user:{companyId:ctx.company_id,id:openBill.rows[0].created_by}};
          const root=await client.query("SELECT bs.sale_id FROM hospitality_bill_sales bs WHERE bs.bill_id=$1 AND bs.source_sale_id IS NULL LIMIT 1",[openBill.rows[0].id]);
          if(!root.rows.length){
            await ensureHospitalityBill(client,actor,ctx.store_id,sessionId);
          }else{
            const billSale=await client.query("SELECT service_charge_amount,service_charge_tax FROM hospitality_bills WHERE id=$1",[openBill.rows[0].id]);
            for(const item of items){
              await client.query(`INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price,discount,tax,total,item_type)
                VALUES($1,$2,$3,$4,$5,0,$6,$7,'PRODUCT')`,[root.rows[0].sale_id,item.product_id,item.name,item.quantity,item.unit_price,item.tax,roundCurrency(item.unit_price*item.quantity+item.tax)]);
            }
            await refreshHospitalitySale(client,root.rows[0].sale_id,ctx.company_id,ctx.store_id,billSale.rows[0].service_charge_amount,billSale.rows[0].service_charge_tax);
            await client.query("UPDATE hospitality_qr_orders SET status='BILLED',sale_id=$2 WHERE id=$1 AND company_id=$3 AND store_id=$4",[inserted.rows[0].id,root.rows[0].sale_id,ctx.company_id,ctx.store_id]);
          }
        }
        return inserted.rows[0];
      });
      res.status(201).json({success:true,data:{order,payment:{mode,status:"UNPAID",message:mode==="CARD"?"Card payment requires a configured payment-provider checkout; the order is not marked paid until provider confirmation.":"Pay at till"}}});
    }catch(error){console.error("QR order error:",error);res.status(400).json({success:false,message:error.message||"Unable to submit order"});}
  });

  router.get("/hospitality/kds/tickets/:id/print", authenticate, authorize("hospitality.kds.view"), async(req,res)=>{
    try{
      const storeId = await resolveStoreId(req, req.user?.storeId, req.query?.storeId || req.user?.storeId);
      const result=await db(`SELECT k.*,t.table_number FROM hospitality_kds_tickets k LEFT JOIN hospitality_tables t ON t.id=k.table_id WHERE k.id=$1 AND k.company_id=$2 AND k.store_id=$3`,[req.params.id,req.user.companyId,storeId]);
      if(!result.rows.length)return res.status(404).json({success:false,message:"Kitchen ticket not found"});
      res.json({success:true,data:buildKitchenPrintPayload(result.rows[0])});
    }catch(error){
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      res.status(500).json({success:false,message:"Unable to prepare kitchen print"});
    }
  });

  router.get("/hospitality/kds/tickets", authenticate, authorize("hospitality.kds.view"), async (req, res) => {
    try {
      const storeId = await resolveStoreId(req, req.query?.storeId || req.user?.storeId, req.query?.storeId || req.user?.storeId);
      const result = await db(`SELECT k.*, t.table_number FROM hospitality_kds_tickets k LEFT JOIN hospitality_tables t ON t.id=k.table_id WHERE k.company_id=$1 AND k.store_id=$2 AND k.status <> 'COMPLETED' ORDER BY k.created_at`, [req.user.companyId, storeId]);
      res.json({ success: true, data: result.rows });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("KDS error:", error); res.status(500).json({ success: false, message: "Unable to load kitchen tickets" });
    }
  });

  router.put("/hospitality/kds/tickets/:id", authenticate, authorize("hospitality.kds.manage"), async (req, res) => {
    if (!["NEW", "IN_PREPARATION", "READY", "COMPLETED"].includes(req.body.status)) return res.status(400).json({ success: false, message: "Invalid kitchen status" });
    try {
      const storeId = await resolveStoreId(req, req.user?.storeId, req.body?.storeId || req.user?.storeId);
      const result = await db(`UPDATE hospitality_kds_tickets SET status=$3, updated_at=NOW() WHERE id=$1 AND company_id=$2 AND store_id=$4 RETURNING *`, [req.params.id, req.user.companyId, req.body.status, storeId]);
      if (!result.rows.length) return res.status(404).json({ success: false, message: "Kitchen ticket not found" });
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      if (error.status === 403) return res.status(403).json({ success: false, message: error.message || "You do not have access to this store" });
      console.error("KDS update error:", error); res.status(500).json({ success: false, message: "Unable to update kitchen ticket" });
    }
  });
  return router;
}
