import express from "express";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

/*
 * Staff attendance (clock in/out) — routes/attendance.js
 *
 * Reuses the EXISTING architecture; no separate employee identity system:
 *   - Staff = users (req.user from the verified session)
 *   - Tenant = companies, location = stores
 *   - Management visibility = the existing attendance.view permission with
 *     the same admin/owner bypass used by every other router.
 *
 * Time handling rules (server-authoritative):
 *   - clock_in / clock_out are always set with NOW() by the server.
 *   - worked_minutes is computed by the SERVER from the recorded timestamps
 *     when the session closes. No clock or duration is ever accepted from
 *     the client.
 *   - At most one OPEN session per user: enforced by the partial unique
 *     index uq_attendance_open_per_user (same atomic pattern as
 *     uq_till_sessions_open_per_terminal in routes/till.js). The
 *     SELECT-then-INSERT guard below is the friendly path; a concurrent
 *     clock-in lands on the 23505 branch and still gets 409.
 *
 * Isolation:
 *   - /me endpoints operate strictly on req.user (id/companyId/storeId)
 *     from the signed session — the client supplies nothing but its token.
 *   - The management list is company-scoped by default and further
 *     restricted to the caller's assigned stores for non-admin roles
 *     (same store-level rule as inventory/transfers, via canAccessStore).
 *   - A specific user's records can only be listed by users holding
 *     attendance.view (admins bypass), and the target user must belong to
 *     the caller's company.
 */

export default function createAttendanceRouter({
  authenticate,
  db,
  canViewCompanyCustomers,
  canAccessStore,
  writeAudit,
}) {
  const router = express.Router();

  function iso(value) {
    return value ? new Date(value).toISOString() : null;
  }

  function serialize(row) {
    return {
      id: row.id,
      companyId: row.company_id,
      storeId: row.store_id,
      userId: row.user_id,
      username: row.username ?? null,
      fullName: row.full_name ?? null,
      storeName: row.store_name ?? null,
      status: row.status,
      clockIn: iso(row.clock_in),
      clockOut: iso(row.clock_out),
      workedMinutes: row.worked_minutes ?? null,
      note: row.note ?? null,
    };
  }

  /*
   * POST /api/attendance/clock-in
   * Opens an attendance session for the CALLING user, in the caller's own
   * company + store (all three claims come from the signed session).
   * Duplicate clock-ins (an existing open session) are rejected with 409.
   */
  router.post("/attendance/clock-in", authenticate, async (req, res) => {
    try {
      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id,
        systemKey: "function:attendance.clock_in",
        req,
        input: {},
        storeId: req.user.storeId || null,
        source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "attendance.clock_in" },
      });
      const row = execution.result;
      if (writeAudit && row?.id) {
        await writeAudit(req.user.companyId, req.user.id, "attendance.clock_in", "attendance_record", row.id, { storeId: row.store_id || req.user.storeId || null });
      }
      res.status(201).json({ success: true, message: "Clocked in", data: serialize(row), workflowRunId: execution.runId, correlationId: execution.correlationId });
    } catch (error) {
      const status = error?.code === "23505" || /already clocked in/i.test(error?.message || "") ? 409 : 400;
      console.error("Clock-in workflow error:", error);
      res.status(status).json({ success: false, message: error.message || "Unable to record clock-in", workflowRunId: error.workflowRunId || null });
    }
  });

  /*
   * GET /api/attendance/me
   * The calling user's current clock-in status: the open session (if any) or
   * the most recent closed session. The elapsed minutes of an open session
   * are computed SERVER-SIDE from the recorded clock_in against the same
   * database clock (NOW()) that stamped the clock-in — never the browser.
   */
  router.get("/attendance/me", authenticate, async (req, res) => {
    try {
      const result = await db(
        `SELECT ar.id, ar.company_id, ar.store_id, ar.user_id, ar.status,
                ar.clock_in, ar.clock_out, ar.worked_minutes, ar.note,
                CASE WHEN ar.status = 'open'
                     THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - ar.clock_in)) / 60))::int
                     ELSE NULL
                END AS elapsed_minutes
           FROM attendance_records ar
          WHERE ar.user_id = $1
          ORDER BY ar.clock_in DESC
          LIMIT 1`,
        [req.user.id]
      );

      if (!result.rows.length) {
        return res.json({ success: true, data: null });
      }

      const row = result.rows[0];
      const data = serialize(row);
      if (row.status === "open") {
        data.elapsedMinutes = row.elapsed_minutes ?? null;
      }
      res.json({ success: true, data });
    } catch (error) {
      console.error("Attendance status error:", error);
      res.status(500).json({ success: false, message: "Unable to load attendance status" });
    }
  });

  /*
   * POST /api/attendance/clock-out
   * Closes the calling user's OPEN session. The official clock-out time is
   * NOW() and worked_minutes is computed here from the recorded timestamps.
   * Without an open session the request is rejected with 409.
   */
  router.post("/attendance/clock-out", authenticate, async (req, res) => {
    try {
      const execution = await executeSystemWorkflow({
        db,
        companyId: req.user.companyId,
        userId: req.user.id,
        systemKey: "function:attendance.clock_out",
        req,
        input: {},
        storeId: req.user.storeId || null,
        source: { type: "api", method: req.method, path: req.originalUrl || req.path, capability: "attendance.clock_out" },
      });
      const row = execution.result;
      if (writeAudit && row?.id) {
        await writeAudit(req.user.companyId, req.user.id, "attendance.clock_out", "attendance_record", row.id, { workedMinutes: row.worked_minutes ?? null });
      }
      res.json({ success: true, message: "Clocked out", data: serialize(row), workflowRunId: execution.runId, correlationId: execution.correlationId });
    } catch (error) {
      const status = /not clocked in/i.test(error?.message || "") ? 409 : 400;
      console.error("Clock-out workflow error:", error);
      res.status(status).json({ success: false, message: error.message || "Unable to record clock-out", workflowRunId: error.workflowRunId || null });
    }
  });

  /*
   * GET /api/attendance/me/records
   * The calling user's own attendance history (last 100 sessions). A user
   * can always see their own records regardless of attendance.view.
   */
  router.get("/attendance/me/records", authenticate, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
      const result = await db(
        `SELECT ar.id, ar.company_id, ar.store_id, ar.user_id, ar.status,
                ar.clock_in, ar.clock_out, ar.worked_minutes, ar.note,
                s.name AS store_name
           FROM attendance_records ar
           LEFT JOIN stores s ON s.id = ar.store_id
          WHERE ar.user_id = $1
          ORDER BY ar.clock_in DESC
          LIMIT $2`,
        [req.user.id, limit]
      );
      res.json({ success: true, data: result.rows.map(serialize) });
    } catch (error) {
      console.error("Own attendance records error:", error);
      res.status(500).json({ success: false, message: "Unable to load attendance records" });
    }
  });

  /*
   * GET /api/attendance/users/:userId/records
   * Management view of ONE staff member's attendance. Requires
   * attendance.view (admins/owners bypass, as everywhere else). The target
   * user must belong to the caller's company; non-admin callers may only
   * list users whose stores intersect their own store assignments.
   */
  router.get(
    "/attendance/users/:userId/records",
    authenticate,
    async (req, res) => {
      try {
        const hasCompanyScope = await canViewCompanyCustomers(req.user);

        let hasPermission = hasCompanyScope;
        if (!hasPermission && req.user.roleId) {
          const codes = await db(
            `SELECT p.code
               FROM role_permissions rp
               INNER JOIN permissions p ON p.id = rp.permission_id
              WHERE rp.role_id = $1`,
            [req.user.roleId]
          );
          hasPermission = codes.rows.some((row) => row.code === "attendance.view");
        }
        if (!hasPermission) {
          return res
            .status(403)
            .json({ success: false, message: "You do not have permission to view attendance records" });
        }

        const target = await db(
          `SELECT id, company_id, store_id, username, full_name FROM users WHERE id = $1 LIMIT 1`,
          [req.params.userId]
        );
        if (!target.rows.length) {
          return res.status(404).json({ success: false, message: "User not found" });
        }
        const targetUser = target.rows[0];

        /* Tenant isolation: another company's staff does not exist here. */
        if (targetUser.company_id !== req.user.companyId) {
          return res.status(404).json({ success: false, message: "User not found" });
        }

        /* Store-level rule: non-admin callers may only view staff whose
         * store assignments overlap their own. */
        if (!isAdmin && targetUser.store_id) {
          const allowed = await canAccessStore(req.user, targetUser.store_id);
          if (!allowed) {
            return res
              .status(403)
              .json({ success: false, message: "You do not have permission to view this staff member's attendance" });
          }
        }

        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 200);
        const result = await db(
          `SELECT ar.id, ar.company_id, ar.store_id, ar.user_id, ar.status,
                  ar.clock_in, ar.clock_out, ar.worked_minutes, ar.note,
                  s.name AS store_name
             FROM attendance_records ar
             LEFT JOIN stores s ON s.id = ar.store_id
            WHERE ar.user_id = $1
            ORDER BY ar.clock_in DESC
            LIMIT $2`,
          [targetUser.id, limit]
        );

        res.json({
          success: true,
          data: result.rows.map(serialize),
          staff: {
            id: targetUser.id,
            username: targetUser.username,
            fullName: targetUser.full_name,
          },
        });
      } catch (error) {
        console.error("Staff attendance records error:", error);
        res.status(500).json({ success: false, message: "Unable to load attendance records" });
      }
    }
  );

  /*
   * GET /api/attendance
   * Management list of attendance records for the company. Requires
   * attendance.view (admin/owner bypass). Optional ?storeId= narrows to
   * one store — refused (403/404) for callers without access to that store
   * under the existing canAccessStore rule. Optional ?userId= narrows to
   * one staff member (company-scoped).
   */
  router.get("/attendance", authenticate, async (req, res) => {
    try {
      const hasCompanyScope = await canViewCompanyCustomers(req.user);

      if (!hasCompanyScope) {
        const codes = await db(
          `SELECT p.code
             FROM role_permissions rp
             INNER JOIN permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = $1`,
          [req.user.roleId]
        );
        const has = codes.rows.some((row) => row.code === "attendance.view");
        if (!has) {
          return res
            .status(403)
            .json({ success: false, message: "You do not have permission to view attendance records" });
        }
      }

      const params = [req.user.companyId];
      const conditions = ["ar.company_id = $1"];

      let storeId = null;
      if (req.query.storeId) {
        storeId = String(req.query.storeId);
        const store = await db(
          `SELECT id FROM stores WHERE id = $1 AND company_id = $2 LIMIT 1`,
          [storeId, req.user.companyId]
        );
        if (!store.rows.length) {
          /* Another company's store (or an unknown store) is not addressable. */
          return res.status(404).json({ success: false, message: "Store not found" });
        }
        if (!hasCompanyScope) {
          const allowed = await canAccessStore(req.user, storeId);
          if (!allowed) {
            return res
              .status(403)
              .json({ success: false, message: "You do not have permission to view this store's attendance" });
          }
        }
        params.push(storeId);
        conditions.push(`ar.store_id = $${params.length}`);
      }

      if (req.query.userId) {
        const target = await db(
          `SELECT id FROM users WHERE id = $1 AND company_id = $2 LIMIT 1`,
          [String(req.query.userId), req.user.companyId]
        );
        if (!target.rows.length) {
          return res.status(404).json({ success: false, message: "User not found" });
        }
        /* Store-level rule for non-admin callers: the staff member's own
         * store must be within the caller's assignments. */
        if (!hasCompanyScope) {
          const targetUser = await db(
            `SELECT store_id FROM users WHERE id = $1 LIMIT 1`,
            [String(req.query.userId)]
          );
          const targetStoreId = targetUser.rows[0]?.store_id ?? null;
          if (targetStoreId) {
            const allowed = await canAccessStore(req.user, targetStoreId);
            if (!allowed) {
              return res.status(403).json({
                success: false,
                message: "You do not have permission to view this staff member's attendance",
              });
            }
          }
        }
        params.push(String(req.query.userId));
        conditions.push(`ar.user_id = $${params.length}`);
      }

      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
      params.push(limit);

      const result = await db(
        `SELECT ar.id, ar.company_id, ar.store_id, ar.user_id, ar.status,
                ar.clock_in, ar.clock_out, ar.worked_minutes, ar.note,
                u.username, u.full_name, s.name AS store_name
           FROM attendance_records ar
           LEFT JOIN users u ON u.id = ar.user_id
           LEFT JOIN stores s ON s.id = ar.store_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY ar.clock_in DESC
          LIMIT $${params.length}`,
        params
      );

      res.json({ success: true, data: result.rows.map(serialize) });
    } catch (error) {
      console.error("Attendance list error:", error);
      res.status(500).json({ success: false, message: "Unable to load attendance records" });
    }
  });

  return router;
}
