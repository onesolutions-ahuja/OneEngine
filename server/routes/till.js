import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

export default function createTillRouter({ authenticate, authorize, db, pool, getRolePermissionCodes, canViewCompanyCustomers }) {
  const router = express.Router();

  function money(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  async function calculateCashPosition(req, {
    openingCash = 0,
    cashIn = 0,
    cashOut = 0,
    cashSales = 0,
    cashRefunds = 0,
    countedCash = 0,
    requestedCashOut = 0,
    terminalId = null,
  } = {}) {
    const execution = await executeSystemWorkflow({
      db,
      companyId: req.user.companyId,
      userId: req.user.id || null,
      systemKey: "flow:till.cash.position",
      req,
      input: {
        openingCash: Number(openingCash) || 0,
        cashIn: Number(cashIn) || 0,
        cashOut: Number(cashOut) || 0,
        cashSales: Number(cashSales) || 0,
        cashRefunds: Number(cashRefunds) || 0,
        countedCash: Number(countedCash) || 0,
        requestedCashOut: Number(requestedCashOut) || 0,
      },
      storeId: req.user.storeId || null,
      tillId: terminalId || req.user.tillId || null,
      source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "till.cash.position" },
    });
    return execution?.result || {};
  }

  /*
   * GET /api/till/sessions/current
   * Returns the currently open till session for the authenticated user's store.
   */
  router.get(
    "/till/sessions/current",
    authenticate,
    authorize("till.open"),
    async (req, res) => {
      try {
        const result = await db(
          `
          SELECT ts.id, ts.terminal_id, ts.user_id, ts.opening_cash, ts.closing_cash,
                 ts.expected_cash, ts.cash_difference, ts.status, ts.opened_at, ts.closed_at, ts.closed_by,
                 t.name AS terminal_name, u.username AS opened_by_name,
                 COALESCE(SUM(CASE WHEN cm.type = 'cash_in' THEN cm.amount ELSE 0 END), 0) AS cash_in_total,
                 COALESCE(SUM(CASE WHEN cm.type = 'cash_out' THEN cm.amount ELSE 0 END), 0) AS cash_out_total,
          (
            SELECT COALESCE(SUM(sa.total), 0)
            FROM sales sa
            INNER JOIN payments pa ON pa.sale_id = sa.id
            WHERE sa.company_id = c.id
              AND sa.store_id = s.id
              AND sa.terminal_id = ts.terminal_id
              AND pa.payment_method = 'cash'
              AND sa.status = 'completed'
              AND sa.created_at BETWEEN ts.opened_at AND COALESCE(ts.closed_at, NOW())
          ) AS cash_sales,
          (
            SELECT COALESCE(SUM(r.amount), 0)
            FROM refunds r
            WHERE r.payment_method = 'cash'
              AND r.created_at BETWEEN ts.opened_at AND COALESCE(ts.closed_at, NOW())
              AND EXISTS (
                SELECT 1 FROM sales rs
                WHERE rs.id = r.sale_id
                  AND rs.company_id = c.id
                  AND rs.store_id = s.id
                  AND rs.terminal_id = ts.terminal_id
              )
          ) AS cash_refunds
          FROM till_sessions ts
          INNER JOIN terminals t ON t.id = ts.terminal_id
          INNER JOIN stores s ON s.id = t.store_id
          INNER JOIN companies c ON c.id = s.company_id
          LEFT JOIN users u ON u.id = ts.user_id
          LEFT JOIN cash_movements cm ON cm.till_session_id = ts.id
          WHERE ts.company_id = $1
            AND ts.store_id = $2
            AND ts.status = 'open'
          GROUP BY ts.id, t.name, u.username, c.id, s.id
          ORDER BY ts.opened_at DESC
          LIMIT 1
          `,
          [req.user.companyId, req.user.storeId]
        );
        /* T-TILL: the backend is authoritative for the cash position — the
         * current/expected cash is computed HERE, never on the client. */
        const row = result.rows[0];
        let data = null;
        if (row) {
          const cashPosition = await calculateCashPosition(req, {
            openingCash: row.opening_cash,
            cashIn: row.cash_in_total,
            cashOut: row.cash_out_total,
            cashSales: row.cash_sales,
            cashRefunds: row.cash_refunds,
            terminalId: row.terminal_id,
          });
          data = {
            ...row,
            cash_refunds: Number(row.cash_refunds) || 0,
            current_cash: Number(cashPosition.currentCash) || 0,
          };
        }
        res.json({ success: true, data });
      } catch (error) {
        console.error("Load current till session error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load current till session" });
      }
    }
  );

  /*
   * GET /api/till/sessions
   * Returns till session history for the authenticated user's store.
   */
  router.get(
    "/till/sessions",
    authenticate,
    authorize("till.open"),
    async (req, res) => {
      try {
        const result = await db(
          `
          SELECT ts.id, ts.terminal_id, ts.user_id, ts.opening_cash, ts.closing_cash,
                 ts.expected_cash, ts.cash_difference, ts.status, ts.opened_at, ts.closed_at,
                 t.name AS terminal_name, u.username AS opened_by_name, cl.username AS closed_by_name
          FROM till_sessions ts
          INNER JOIN terminals t ON t.id = ts.terminal_id
          INNER JOIN stores s ON s.id = t.store_id
          INNER JOIN companies c ON c.id = s.company_id
          LEFT JOIN users u ON u.id = ts.user_id
          LEFT JOIN users cl ON cl.id = ts.closed_by
          WHERE ts.company_id = $1
            AND ts.store_id = $2
          ORDER BY ts.opened_at DESC
          LIMIT 50
          `,
          [req.user.companyId, req.user.storeId]
        );
        res.json({ success: true, data: result.rows });
      } catch (error) {
        console.error("Load till history error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load till history" });
      }
    }
  );

  /*
   * POST /api/till/sessions
   * Opens a new till session for the default terminal of the authenticated user's store.
   */
  router.post(
    "/till/sessions",
    authenticate,
    authorize("till.open"),
    (_req, res) => res.status(410).json({ success: false, code: "METADATA_ACTION_REQUIRED", message: "Till session opening is executed through configured metadata Actions/Flows." })
  );

  /*
   * POST /api/till/sessions/:id/close
   * Closes an open till session, calculating expected cash from opening, movements and cash sales.
   */
  router.post(
    "/till/sessions/:id/close",
    authenticate,
    authorize("till.close"),
    (_req, res) => res.status(410).json({ success: false, code: "METADATA_ACTION_REQUIRED", message: "Till session closing is executed through configured metadata Actions/Flows." })
  );

  /*
   * GET /api/till/sessions/:id/cash-movements
   * Returns cash movement history for a specific till session.
   * Requires cash.adjustment or cash.payout permission.
   */
  router.get(
    "/till/sessions/:id/cash-movements",
    authenticate,
    authorize("cash.adjustment", "cash.payout"),
    async (req, res) => {
      try {
        const session = await db(
          "SELECT id FROM till_sessions WHERE id=$1 AND company_id=$2 AND store_id=$3",
          [req.params.id, req.user.companyId, req.user.storeId]
        );
        if (!session.rows.length)
          return res
            .status(404)
            .json({ success: false, message: "Till session not found" });
        const result = await db(
          `SELECT cm.id, cm.till_session_id, cm.user_id, u.username, cm.type, cm.amount, cm.reason, cm.created_at
           FROM cash_movements cm
           LEFT JOIN users u ON u.id = cm.user_id
           WHERE cm.till_session_id = $1
           ORDER BY cm.created_at DESC
           LIMIT 200`,
          [req.params.id]
        );
        res.json({ success: true, data: result.rows });
      } catch (error) {
        console.error("Load cash movements error:", error);
        res
          .status(500)
          .json({ success: false, message: "Unable to load cash movements" });
      }
    }
  );

  /*
   * POST /api/till/sessions/:id/cash-movements
   * Records a cash-in or cash-out movement for a specific till session.
   * Requires cash.adjustment (cash_in) or cash.payout (cash_out) permission.
   */
  router.post(
    "/till/sessions/:id/cash-movements",
    authenticate,
    authorize("cash.adjustment"),
    (_req, res) => res.status(410).json({ success: false, code: "METADATA_ACTION_REQUIRED", message: "Cash movement creation is executed through configured metadata Actions/Flows." })
  );

  /*
   * GET /api/till/sessions/active
   * T-TILL: the caller's own active session for THIS terminal (matched by
   * device identifier or the terminal the session was opened with). Distinct
   * from /sessions/current (store-wide, for supervisors) — this answers the
   * POS question "is MY till open?" and drives the Open Till modal.
   */
  router.get(
    "/till/sessions/active",
    authenticate,
    authorize("till.open"),
    async (req, res) => {
      try {
        /* The caller's terminal: matched by device identifier when the POS
         * sends one, else the store's first active terminal. */
        let terminalId = null;
        if (req.query.deviceIdentifier) {
          const t = await db(
            "SELECT id FROM terminals WHERE device_identifier = $1 AND store_id = $2 AND active = true",
            [req.query.deviceIdentifier, req.user.storeId]
          );
          if (t.rows.length) terminalId = t.rows[0].id;
        }
        if (!terminalId) {
          const t = await db(
            "SELECT id FROM terminals WHERE store_id = $1 AND active = true ORDER BY created_at LIMIT 1",
            [req.user.storeId]
          );
          terminalId = t.rows[0]?.id ?? null;
          if (!terminalId) return res.json({ success: true, data: null });
        }

        const result = await db(
          `SELECT ts.id, ts.company_id, ts.store_id, ts.terminal_id, ts.user_id,
                  t.terminal_number, u.username AS opened_by_name,
                  ts.opening_cash, ts.status, ts.opened_at,
                  COALESCE((SELECT SUM(amount) FROM cash_movements cm WHERE cm.till_session_id = ts.id AND cm.type='cash_in'), 0) AS cash_in_total,
                  COALESCE((SELECT SUM(amount) FROM cash_movements cm WHERE cm.till_session_id = ts.id AND cm.type='cash_out'), 0) AS cash_out_total,
                  (
                    SELECT COALESCE(SUM(s.total), 0)
                    FROM sales s
                    INNER JOIN payments pa ON pa.sale_id = s.id
                    WHERE s.company_id = ts.company_id AND s.store_id = ts.store_id
                      AND s.terminal_id = ts.terminal_id
                      AND pa.payment_method='cash' AND s.status='completed'
                      AND s.created_at BETWEEN ts.opened_at AND NOW()
                  ) AS cash_sales_total,
                  (
                    SELECT COALESCE(SUM(r.amount), 0)
                    FROM refunds r
                    INNER JOIN sales s ON s.id = r.sale_id
                    WHERE s.company_id = ts.company_id AND s.store_id = ts.store_id
                      AND s.terminal_id = ts.terminal_id
                      AND r.payment_method='cash'
                      AND r.created_at BETWEEN ts.opened_at AND NOW()
                  ) AS cash_refunds_total
           FROM till_sessions ts
           INNER JOIN terminals t ON t.id = ts.terminal_id
           LEFT JOIN users u ON u.id = ts.user_id
           WHERE ts.terminal_id = $1 AND ts.status = 'open'
           ORDER BY ts.opened_at DESC
           LIMIT 1`,
          [terminalId]
        );
        if (!result.rows.length) return res.json({ success: true, data: null });
        const row = result.rows[0];
        const cashPosition = await calculateCashPosition(req, {
          openingCash: row.opening_cash,
          cashIn: row.cash_in_total,
          cashOut: row.cash_out_total,
          cashSales: row.cash_sales_total,
          cashRefunds: row.cash_refunds_total,
          terminalId: row.terminal_id,
        });
        const currentCash = Number(cashPosition.currentCash) || 0;
        res.json({
          success: true,
          data: {
            id: row.id, companyId: row.company_id, storeId: row.store_id, terminalId: row.terminal_id,
            terminalNumber: row.terminal_number, openedBy: row.opened_by_name, openedAt: row.opened_at,
            openingCash: Number(row.opening_cash) || 0, currentCash,
            cashInTotal: Number(row.cash_in_total) || 0, cashOutTotal: Number(row.cash_out_total) || 0,
            cashSalesTotal: Number(row.cash_sales_total) || 0, cashRefundsTotal: Number(row.cash_refunds_total) || 0,
            status: row.status,
          },
        });
      } catch (error) {
        console.error("Load active till session error:", error);
        res.status(500).json({ success: false, message: "Unable to load active till session" });
      }
    }
  );

  /*
   * POST /api/till/drawer/open
   * T-TILL software drawer control: records a drawer-open event (audit) and
   * returns an ack for the POS to trigger the local hardware kick it already
   * owns. Permission: cash.open_drawer (admin bypass per authorize()).
   */
  router.post(
    "/till/drawer/open",
    authenticate,
    authorize("cash.open_drawer"),
    (_req, res) => res.status(410).json({ success: false, code: "METADATA_ACTION_REQUIRED", message: "Drawer opening is executed through configured metadata Actions/Flows." })
  );

  return router;
}
