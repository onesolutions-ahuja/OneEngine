import express from "express";
import { BUILTIN_DEBUG_CODES, DEBUG_CODE_RE, LEGACY_DEBUG_CODE_RE, normalizeDebugCode } from "../services/debugCodes.js";

const SEVERITIES = new Set(["INFO", "WARNING", "ERROR", "CRITICAL", "FATAL"]);

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeBody(body = {}) {
  const code = clean(body.code, 6).toUpperCase();
  const severity = clean(body.severity || "ERROR", 20).toUpperCase();
  if (!DEBUG_CODE_RE.test(code)) throw Object.assign(new Error("Code must use OE + subsystem + cause + 2 digits, for example OEWA01"), { status: 400 });
  if (!SEVERITIES.has(severity)) throw Object.assign(new Error("Invalid severity"), { status: 400 });
  const category = clean(body.category, 80);
  const title = clean(body.title, 160);
  const userMessage = clean(body.userMessage, 500);
  const internalDescription = clean(body.internalDescription, 2000);
  if (!category || !title || !userMessage || !internalDescription) {
    throw Object.assign(new Error("Category, title, user message and internal description are required"), { status: 400 });
  }
  const matchPattern = clean(body.matchPattern, 1000);
  if (matchPattern) {
    try { new RegExp(matchPattern, "i"); }
    catch { throw Object.assign(new Error("Match pattern must be a valid regular expression"), { status: 400 }); }
  }
  return {
    code,
    category,
    title,
    userMessage,
    internalDescription,
    severity,
    retryable: body.retryable === true,
    active: body.active !== false,
    matchPattern,
  };
}

export default function createDebugCodesRouter({ authenticate, authorize, db }) {
  const router = express.Router();
  const manage = [authenticate, authorize("oneengine.manage")];

  router.get("/platform/developer/debug-codes", ...manage, async (_req, res) => {
    const result = await db(
      `SELECT code,category,title,user_message AS "userMessage",
              internal_description AS "internalDescription",severity,retryable,active,
              built_in AS "builtIn",match_pattern AS "matchPattern",
              subsystem_key AS "subsystemKey",cause_key AS "causeKey",legacy_code AS "legacyCode",
              created_at AS "createdAt",updated_at AS "updatedAt"
         FROM oneengine_debug_codes
        ORDER BY category,sort_order,code`
    );
    res.json({ success: true, data: result.rows });
  });

  router.post("/platform/developer/debug-codes", ...manage, async (req, res) => {
    const item = normalizeBody(req.body);
    const exists = await db("SELECT code FROM oneengine_debug_codes WHERE code=$1", [item.code]);
    if (exists.rows[0]) return res.status(409).json({ success: false, message: "This debug code already exists" });
    const result = await db(
      `INSERT INTO oneengine_debug_codes
        (code,category,title,user_message,internal_description,severity,retryable,active,built_in,match_pattern,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9,$10)
       RETURNING code,category,title,user_message AS "userMessage",
                 internal_description AS "internalDescription",severity,retryable,active,
                 built_in AS "builtIn",match_pattern AS "matchPattern",
                 created_at AS "createdAt",updated_at AS "updatedAt"`,
      [item.code,item.category,item.title,item.userMessage,item.internalDescription,item.severity,item.retryable,item.active,item.matchPattern || null,req.user?.id || null]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  });

  router.patch("/platform/developer/debug-codes/:code", ...manage, async (req, res) => {
    const rawCode = clean(req.params.code, 6).toUpperCase();
    const code = normalizeDebugCode(rawCode);
    if (!DEBUG_CODE_RE.test(code) && !LEGACY_DEBUG_CODE_RE.test(rawCode)) return res.status(400).json({ success: false, message: "Invalid OneEngine debug code" });
    const current = await db("SELECT * FROM oneengine_debug_codes WHERE code=$1", [code]);
    if (!current.rows[0]) return res.status(404).json({ success: false, message: "Debug code not found" });
    const row = current.rows[0];
    const item = normalizeBody({
      code,
      category: req.body.category ?? row.category,
      title: req.body.title ?? row.title,
      userMessage: req.body.userMessage ?? row.user_message,
      internalDescription: req.body.internalDescription ?? row.internal_description,
      severity: req.body.severity ?? row.severity,
      retryable: req.body.retryable ?? row.retryable,
      active: req.body.active ?? row.active,
      matchPattern: req.body.matchPattern ?? row.match_pattern,
    });
    const result = await db(
      `UPDATE oneengine_debug_codes
          SET category=$1,title=$2,user_message=$3,internal_description=$4,severity=$5,
              retryable=$6,active=$7,match_pattern=$8,updated_at=NOW()
        WHERE code=$9
        RETURNING code,category,title,user_message AS "userMessage",
                  internal_description AS "internalDescription",severity,retryable,active,
                  built_in AS "builtIn",match_pattern AS "matchPattern",
                  created_at AS "createdAt",updated_at AS "updatedAt"`,
      [item.category,item.title,item.userMessage,item.internalDescription,item.severity,item.retryable,item.active,item.matchPattern || null,code]
    );
    res.json({ success: true, data: result.rows[0] });
  });

  router.get("/platform/developer/debug-events", ...manage, async (req, res) => {
    const rawCode = clean(req.query.code, 6).toUpperCase();
    const code = normalizeDebugCode(rawCode);
    const reference = clean(req.query.reference, 32).toUpperCase();
    const params = [];
    const filters = [];
    if (DEBUG_CODE_RE.test(code) || LEGACY_DEBUG_CODE_RE.test(rawCode)) {
      params.push(code);
      filters.push(`(e.code=${params.length} OR e.code=(SELECT legacy_code FROM oneengine_debug_codes WHERE code=${params.length} LIMIT 1))`);
    }
    if (reference) { params.push(reference); filters.push(`e.reference=$${params.length}`); }
    const result = await db(
      `SELECT e.reference,e.code,e.company_id AS "companyId",e.user_id AS "userId",
              e.endpoint,e.http_method AS "httpMethod",e.http_status AS "httpStatus",
              e.technical_code AS "technicalCode",e.technical_message AS "technicalMessage",
              e.environment,e.created_at AS "createdAt",
              c.title,c.category,c.severity
         FROM oneengine_debug_events e
         LEFT JOIN oneengine_debug_codes c ON c.code=e.code
        ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
        ORDER BY e.created_at DESC
        LIMIT 200`,
      params
    );
    res.json({ success: true, data: result.rows });
  });

  router.get("/platform/developer/debug-code-seed", ...manage, (_req, res) => {
    res.json({ success: true, data: BUILTIN_DEBUG_CODES });
  });

  return router;
}
