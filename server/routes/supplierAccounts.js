import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

const LEDGER_ENTRY_TYPES = new Set(["INVOICE", "PAYMENT", "RETURN_CREDIT", "OPENING"]);
const LEDGER_ENTRY_ALIASES = {
  CREDIT: "RETURN_CREDIT",
  DEBIT: "OPENING",
  SUPPLIER_CREDIT: "RETURN_CREDIT",
  SUPPLIER_DEBIT: "OPENING",
};

function normalizeEntryType(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return null;
  const resolved = LEDGER_ENTRY_ALIASES[raw] ?? raw;
  return LEDGER_ENTRY_TYPES.has(resolved) ? resolved : null;
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(text)) return true;
  if (["0", "false", "no", "n"].includes(text)) return false;
  return null;
}

function parsePage(value, fallback = 1) {
  const page = Number.parseInt(value ?? String(fallback), 10);
  return Number.isFinite(page) && page > 0 ? page : fallback;
}

function parsePageSize(value, fallback = 25, max = 200) {
  const pageSize = Number.parseInt(value ?? String(fallback), 10);
  const safe = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : fallback;
  return Math.min(safe, max);
}

function parseJsonFilter(rawValue) {
  if (!rawValue) return {};
  if (typeof rawValue === "object") return rawValue;
  try {
    const parsed = JSON.parse(String(rawValue));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function createSupplierAccountsRouter({ authenticate, authorize, db, pool }) {
  const router = express.Router();
  const view = ["purchase.view", "inventory.view"];
  const manage = ["purchase.edit", "inventory.adjust"];

  async function ensureSupplierInCompany(supplierId, companyId) {
    const supplier = await db(
      "SELECT id, company_id, active FROM suppliers WHERE id=$1 AND company_id=$2",
      [supplierId, companyId]
    );
    if (!supplier.rows.length) {
      const error = new Error("Supplier not found");
      error.status = 404;
      throw error;
    }
    return supplier.rows[0];
  }

  async function ensureStoreInCompany(storeId, companyId) {
    if (!storeId) return null;
    const store = await db(
      "SELECT id, company_id FROM stores WHERE id=$1 AND company_id=$2",
      [storeId, companyId]
    );
    if (!store.rows.length) {
      const error = new Error("Store not found");
      error.status = 404;
      throw error;
    }
    return store.rows[0];
  }

  function normalizeLedgerRow(row) {
    return {
      ...row,
      amount: Number(row.amount) || 0,
      running_balance: row.running_balance === null || row.running_balance === undefined ? null : Number(row.running_balance),
      balance: row.balance === null || row.balance === undefined ? null : Number(row.balance),
      debit: Boolean(row.debit),
      created_at: row.created_at || row.createdAt || null,
    };
  }

  async function createLedgerEntry(req, res) {
    const effectiveType = normalizeEntryType(req.body?.entryType ?? req.body?.entry_type ?? req.body?.type);
    const rawDebit = parseBoolean(req.body?.debit ?? req.body?.direction);
    const input = {
      ...req.body,
      entryType: effectiveType,
      debit: rawDebit,
      supplierId: req.body?.supplierId,
      storeId: req.body?.storeId || req.user.storeId || null,
      reference: req.body?.reference ?? req.body?.referenceNumber ?? req.body?.ref ?? null,
      description: req.body?.description ?? req.body?.notes ?? null,
    };
    try {
      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id || null,
        systemKey: "function:supplier.ledger.adjust",
        req,
        input,
        storeId: input.storeId,
        source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "supplier.ledger.adjust" },
        extraContext: { pool },
      });
      res.status(201).json({ success: true, data: normalizeLedgerRow(execution.result), workflowRunId: execution.runId, correlationId: execution.correlationId });
    } catch (error) {
      console.error("Create supplier ledger entry error:", error);
      const status = error.code === "DUPLICATE_LEDGER_ENTRY" || error.code === "23505" ? 409
        : /not found/i.test(error.message || "") ? 404 : 400;
      res.status(status).json({ success: false, message: error.message || "Unable to create supplier ledger entry" });
    }
  }

  async function getSupplierLedgerEntriesHandler(req, res) {
    try {
      const page = parsePage(req.query.page, 1);
      const pageSize = parsePageSize(req.query.pageSize, 25, 200);
      const offset = (page - 1) * pageSize;
      const supplierId = req.query.supplierId || req.query.supplier_id || null;
      const storeId = req.query.storeId || req.query.store_id || null;
      const search = (req.query.search || req.query.q || "").trim();
      const entryType = normalizeEntryType(req.query.entryType ?? req.query.entry_type ?? req.query.type ?? null);
      const debitFilter = parseBoolean(req.query.debit ?? req.query.direction ?? req.query.credit);
      const filterData = parseJsonFilter(req.query.filter);
      const requestedType = normalizeEntryType(filterData.entryType ?? filterData.entry_type ?? filterData.type ?? null) ?? entryType;
      const requestedDebit = parseBoolean(filterData.debit ?? filterData.direction ?? null) ?? debitFilter;
      const requestedStore = filterData.storeId ?? filterData.store_id ?? storeId;
      const requestedSupplier = (filterData.supplierId ?? filterData.supplier_id ?? supplierId ?? req.params.id) || null;
      const startDate = req.query.startDate || req.query.from || filterData.startDate || filterData.from || null;
      const endDate = req.query.endDate || req.query.to || filterData.endDate || filterData.to || null;
      const referenceFilter = req.query.reference || filterData.reference || null;

      if (requestedSupplier) {
        await ensureSupplierInCompany(requestedSupplier, req.user.companyId);
      }
      if (requestedStore) {
        await ensureStoreInCompany(requestedStore, req.user.companyId);
      }

      const clauses = ["company_id = $1"];
      const params = [req.user.companyId];
      let idx = 2;

      if (requestedSupplier) {
        clauses.push(`supplier_id = $${idx}`);
        params.push(requestedSupplier);
        idx += 1;
      }
      if (requestedStore) {
        clauses.push(`store_id = $${idx}`);
        params.push(requestedStore);
        idx += 1;
      }
      if (requestedType) {
        clauses.push(`entry_type = $${idx}`);
        params.push(requestedType);
        idx += 1;
      }
      if (requestedDebit !== null) {
        clauses.push(`debit = $${idx}`);
        params.push(requestedDebit);
        idx += 1;
      }
      if (referenceFilter) {
        clauses.push(`reference = $${idx}`);
        params.push(String(referenceFilter).trim());
        idx += 1;
      }
      if (startDate) {
        clauses.push(`created_at >= $${idx}`);
        params.push(startDate);
        idx += 1;
      }
      if (endDate) {
        clauses.push(`created_at < $${idx}`);
        params.push(endDate);
        idx += 1;
      }
      if (search) {
        clauses.push(`(LOWER(COALESCE(reference, '')) LIKE LOWER($${idx}) OR LOWER(COALESCE(description, '')) LIKE LOWER($${idx}) OR LOWER(COALESCE(entry_type, '')) LIKE LOWER($${idx}))`);
        const pattern = `%${String(search).trim()}%`;
        params.push(pattern, pattern, pattern);
        idx += 3;
      }

      const countQuery = `SELECT COUNT(*)::int AS total FROM supplier_ledger_entries WHERE ${clauses.join(" AND ")}`;
      const listQuery = `SELECT id, company_id, supplier_id, store_id, entry_type, reference_type, reference_id, reference, amount, debit, description, created_by, created_at
        FROM supplier_ledger_entries
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT $${idx} OFFSET $${idx + 1}`;
      params.push(pageSize, offset);
      const [countResult, rowsResult] = await Promise.all([
        db(countQuery, params.slice(0, params.length - 2)),
        db(listQuery, params),
      ]);
      const total = Number(countResult.rows[0]?.total || 0);
      const data = rowsResult.rows.map(normalizeLedgerRow);
      const pages = total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize));
      res.json({ success: true, data, records: data, page, pageSize, total, pages });
    } catch (error) {
      console.error("List supplier ledger entries error:", error);
      if (error.status === 404) return res.status(404).json({ success: false, message: error.message });
      res.status(500).json({ success: false, message: "Unable to load supplier ledger entries" });
    }
  }

  async function getSupplierSummaryHandler(req, res) {
    try {
      const supplierId = req.params.id || req.query.supplierId || req.query.supplier_id;
      const storeId = req.query.storeId || req.query.store_id || null;
      if (storeId) await ensureStoreInCompany(storeId, req.user.companyId);
      const supplier = await ensureSupplierInCompany(supplierId, req.user.companyId);

      const result = await db(
        `SELECT
          s.id AS supplier_id,
          s.name AS supplier_name,
          s.active,
          COALESCE((SELECT SUM(total) FROM supplier_invoices WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)), 0) AS total_invoice_amount,
          COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)), 0) AS total_paid,
          COALESCE((SELECT SUM(CASE WHEN debit = false THEN amount ELSE 0 END) FROM supplier_ledger_entries WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)), 0) AS total_credits,
          COALESCE((SELECT SUM(CASE WHEN debit = true THEN amount ELSE 0 END) FROM supplier_ledger_entries WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)), 0) AS total_debits,
          COALESCE((SELECT COUNT(*)::int FROM supplier_invoices WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)), 0) AS invoice_count,
          COALESCE((SELECT COUNT(*)::int FROM supplier_payments WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)), 0) AS payment_count,
          COALESCE((SELECT SUM(CASE WHEN debit THEN amount ELSE -amount END) FROM supplier_ledger_entries WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)), 0) AS ledger_balance,
          COALESCE((SELECT MAX(last_tx.created_at) FROM (
            SELECT created_at FROM supplier_invoices WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)
            UNION ALL
            SELECT created_at FROM supplier_payments WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)
            UNION ALL
            SELECT created_at FROM supplier_ledger_entries WHERE company_id=$1 AND supplier_id=$2 AND ($3::uuid IS NULL OR store_id=$3)
          ) AS last_tx), NULL) AS last_transaction_date
         FROM suppliers s
         WHERE s.id=$2 AND s.company_id=$1
         LIMIT 1`,
        [req.user.companyId, supplierId, storeId || null]
      );

      if (!result.rows.length) {
        return res.status(404).json({ success: false, message: "Supplier not found" });
      }

      const row = result.rows[0];
      const totalInvoiceAmount = Number(row.total_invoice_amount) || 0;
      const totalPaid = Number(row.total_paid) || 0;
      const totalCredits = Number(row.total_credits) || 0;
      const totalDebits = Number(row.total_debits) || 0;
      const ledgerBalance = Number(row.ledger_balance) || 0;
      const response = {
        supplier: {
          id: row.supplier_id,
          name: row.supplier_name,
          active: row.active,
        },
        total_invoice_amount: totalInvoiceAmount,
        total_paid: totalPaid,
        total_credits: totalCredits,
        total_debits: totalDebits,
        outstanding_balance: Math.max(0, totalInvoiceAmount - totalPaid),
        ledger_balance: ledgerBalance,
        invoice_count: Number(row.invoice_count) || 0,
        payment_count: Number(row.payment_count) || 0,
        last_transaction_date: row.last_transaction_date || null,
      };
      res.json({ success: true, data: response });
    } catch (error) {
      console.error("Supplier summary error:", error);
      if (error.status === 404) return res.status(404).json({ success: false, message: error.message });
      res.status(500).json({ success: false, message: "Unable to load supplier summary" });
    }
  }

  router.get("/supplier-invoices", authenticate, authorize(...view), async (req, res) => {
    try {
      const result = await db(
        `SELECT i.*, s.name AS supplier_name,
          COALESCE((SELECT SUM(a.amount) FROM supplier_payment_allocations a WHERE a.invoice_id=i.id),0) AS paid_amount
         FROM supplier_invoices i INNER JOIN suppliers s ON s.id=i.supplier_id
        WHERE i.company_id=$1 AND ($2::uuid IS NULL OR i.supplier_id=$2)
        ORDER BY i.invoice_date DESC, i.created_at DESC`,
        [req.user.companyId, req.query.supplierId || null]
      );
      res.json({ success: true, data: result.rows.map((row) => ({
        ...row,
        total: Number(row.total),
        paid_amount: Number(row.paid_amount),
        outstanding_amount: Math.max(0, Number(row.total) - Number(row.paid_amount)),
      })) });
    } catch (error) {
      console.error("List supplier invoices error:", error);
      res.status(500).json({ success: false, message: "Unable to load supplier invoices" });
    }
  });

  router.get("/supplier-ledger-entries", authenticate, authorize(...view), async (req, res) => {
    try {
      const page = parsePage(req.query.page, 1);
      const pageSize = parsePageSize(req.query.pageSize, 25, 200);
      const offset = (page - 1) * pageSize;
      const supplierId = req.query.supplierId || req.query.supplier_id || null;
      const storeId = req.query.storeId || req.query.store_id || null;
      const search = (req.query.search || req.query.q || "").trim();
      const entryType = normalizeEntryType(req.query.entryType ?? req.query.entry_type ?? req.query.type ?? null);
      const debitFilter = parseBoolean(req.query.debit ?? req.query.direction ?? req.query.credit);
      const filterData = parseJsonFilter(req.query.filter);
      const requestedType = normalizeEntryType(filterData.entryType ?? filterData.entry_type ?? filterData.type ?? null) ?? entryType;
      const requestedDebit = parseBoolean(filterData.debit ?? filterData.direction ?? null) ?? debitFilter;
      const requestedStore = filterData.storeId ?? filterData.store_id ?? storeId;
      const requestedSupplier = filterData.supplierId ?? filterData.supplier_id ?? supplierId;
      const startDate = req.query.startDate || req.query.from || filterData.startDate || filterData.from || null;
      const endDate = req.query.endDate || req.query.to || filterData.endDate || filterData.to || null;
      const referenceFilter = req.query.reference || filterData.reference || null;

      if (requestedSupplier) {
        await ensureSupplierInCompany(requestedSupplier, req.user.companyId);
      }
      if (requestedStore) {
        await ensureStoreInCompany(requestedStore, req.user.companyId);
      }

      const clauses = ["company_id = $1"];
      const params = [req.user.companyId];
      let idx = 2;

      if (requestedSupplier) {
        clauses.push(`supplier_id = $${idx}`);
        params.push(requestedSupplier);
        idx += 1;
      }
      if (requestedStore) {
        clauses.push(`store_id = $${idx}`);
        params.push(requestedStore);
        idx += 1;
      }
      if (requestedType) {
        clauses.push(`entry_type = $${idx}`);
        params.push(requestedType);
        idx += 1;
      }
      if (requestedDebit !== null) {
        clauses.push(`debit = $${idx}`);
        params.push(requestedDebit);
        idx += 1;
      }
      if (referenceFilter) {
        clauses.push(`reference = $${idx}`);
        params.push(String(referenceFilter).trim());
        idx += 1;
      }
      if (startDate) {
        clauses.push(`created_at >= $${idx}`);
        params.push(startDate);
        idx += 1;
      }
      if (endDate) {
        clauses.push(`created_at < $${idx}`);
        params.push(endDate);
        idx += 1;
      }
      if (search) {
        clauses.push(`(LOWER(COALESCE(reference, '')) LIKE LOWER($${idx}) OR LOWER(COALESCE(description, '')) LIKE LOWER($${idx}) OR LOWER(COALESCE(entry_type, '')) LIKE LOWER($${idx}))`);
        const pattern = `%${String(search).trim()}%`;
        params.push(pattern, pattern, pattern);
        idx += 3;
      }

      const countQuery = `SELECT COUNT(*)::int AS total FROM supplier_ledger_entries WHERE ${clauses.join(" AND ")}`;
      const listQuery = `SELECT id, company_id, supplier_id, store_id, entry_type, reference_type, reference_id, reference, amount, debit, description, created_by, created_at
        FROM supplier_ledger_entries
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT $${idx} OFFSET $${idx + 1}`;
      params.push(pageSize, offset);
      const [countResult, rowsResult] = await Promise.all([
        db(countQuery, params.slice(0, params.length - 2)),
        db(listQuery, params),
      ]);
      const total = Number(countResult.rows[0]?.total || 0);
      const data = rowsResult.rows.map(normalizeLedgerRow);
      const pages = total === 0 ? 0 : Math.max(1, Math.ceil(total / pageSize));
      res.json({ success: true, data, records: data, page, pageSize, total, pages });
    } catch (error) {
      console.error("List supplier ledger entries error:", error);
      if (error.status === 404) return res.status(404).json({ success: false, message: error.message });
      res.status(500).json({ success: false, message: "Unable to load supplier ledger entries" });
    }
  });

  router.get("/suppliers/:id/ledger", authenticate, authorize(...view), getSupplierLedgerEntriesHandler);

  router.get("/suppliers/:id/summary", authenticate, authorize(...view), getSupplierSummaryHandler);

  router.get("/suppliers/:id/account-summary", authenticate, authorize(...view), getSupplierSummaryHandler);

  router.get("/suppliers/:id/statement", authenticate, authorize(...view), async (req, res) => {
    try {
      const storeId = req.query.storeId || req.query.store_id || null;
      if (storeId) await ensureStoreInCompany(storeId, req.user.companyId);
      const clauses = ["company_id=$1", "supplier_id=$2"];
      const params = [req.user.companyId, req.params.id];
      if (storeId) {
        clauses.push("store_id=$3");
        params.push(storeId);
      }
      const result = await db(
        `SELECT id, entry_type, reference_type, reference_id, amount, debit, description, reference, created_at,
          SUM(CASE WHEN debit THEN amount ELSE -amount END) OVER (ORDER BY created_at,id) AS running_balance
         FROM supplier_ledger_entries
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at,id`,
        params
      );
      res.json({ success: true, data: result.rows.map((row) => normalizeLedgerRow({ ...row, running_balance: row.running_balance })) });
    } catch (error) {
      console.error("Supplier statement error:", error);
      if (error.status === 404) return res.status(404).json({ success: false, message: error.message });
      res.status(500).json({ success: false, message: "Unable to load supplier statement" });
    }
  });

  return router;
}
