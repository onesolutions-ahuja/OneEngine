import express from "express";
import crypto from "crypto";

const PAIRING_TTL_MINUTES = 5;
const SESSION_TTL_HOURS = 12;
const BARCODE_MAX_LENGTH = 128;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const newToken = (prefix) => `${prefix}${crypto.randomBytes(32).toString("base64url")}`;

export default function createMobileScannerRouter({ authenticate, authorize, db, writeAudit = null }) {
  const router = express.Router();

  async function requireScannerSession(req, res, next) {
    const header = req.headers.authorization;
    const token = typeof header === "string" && header.startsWith("Bearer scn_")
      ? header.slice(7)
      : "";
    if (!token) return res.status(401).json({ success: false, message: "Scanner session required" });
    try {
      const result = await db(
        `SELECT ms.id, ms.company_id, ms.store_id, ms.terminal_id, t.name AS till_name
         FROM mobile_scanner_sessions ms
         INNER JOIN terminals t ON t.id = ms.terminal_id
         WHERE ms.session_token_hash = $1 AND ms.revoked_at IS NULL
           AND ms.session_expires_at > NOW() AND t.active = TRUE`,
        [hashToken(token)]
      );
      if (!result.rows[0]) return res.status(401).json({ success: false, message: "Scanner session expired or revoked" });
      req.mobileScanner = result.rows[0];
      return next();
    } catch (error) {
      console.error("Resolve mobile scanner session error:", error);
      return res.status(500).json({ success: false, message: "Unable to resolve scanner session" });
    }
  }

  router.get("/mobile-scanner/tills", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const result = await db(
        `SELECT t.id, t.name, t.terminal_number
         FROM terminals t INNER JOIN stores s ON s.id = t.store_id
         WHERE t.store_id = $1 AND s.company_id = $2 AND t.active = TRUE AND s.active = TRUE
         ORDER BY t.name`,
        [req.user.storeId, req.user.companyId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("List mobile scanner tills error:", error);
      return res.status(500).json({ success: false, message: "Unable to load tills" });
    }
  });

  router.get("/mobile-scanner/settings", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const result = await db(
        `SELECT connection_mode, wifi_mode, bluetooth_enabled
         FROM mobile_scanner_settings WHERE company_id = $1 AND store_id = $2`,
        [req.user.companyId, req.user.storeId]
      );
      return res.json({ success: true, data: result.rows[0] || { connection_mode: "WIFI_QR", wifi_mode: "LOCAL_ONLY", bluetooth_enabled: false } });
    } catch (error) {
      console.error("Load mobile scanner settings error:", error);
      return res.status(500).json({ success: false, message: "Unable to load scanner settings" });
    }
  });

  router.put("/mobile-scanner/settings", authenticate, authorize("integration.manage"), async (req, res) => {
    const { connectionMode = "WIFI_QR", wifiMode = "LOCAL_ONLY", bluetoothEnabled = false } = req.body || {};
    if (connectionMode !== "WIFI_QR" || !["LOCAL_ONLY", "SERVER_RELAY"].includes(wifiMode) || bluetoothEnabled !== false) {
      return res.status(400).json({ success: false, message: "Bluetooth is not available through this browser connector; Wi-Fi / QR is the supported mode" });
    }
    try {
      const result = await db(
        `INSERT INTO mobile_scanner_settings (company_id, store_id, connection_mode, wifi_mode, bluetooth_enabled)
         VALUES ($1, $2, $3, $4, FALSE)
         ON CONFLICT (company_id, store_id) DO UPDATE SET connection_mode = $3, wifi_mode = $4, updated_at = NOW()
         RETURNING connection_mode, wifi_mode, bluetooth_enabled`,
        [req.user.companyId, req.user.storeId, connectionMode, wifiMode]
      );
      return res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      console.error("Save mobile scanner settings error:", error);
      return res.status(500).json({ success: false, message: "Unable to save scanner settings" });
    }
  });

  router.post("/mobile-scanner/pairings", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const { terminalId } = req.body || {};
      if (!terminalId) {
        return res.status(400).json({ success: false, message: "A till is required" });
      }
      const config = await db(
        "SELECT connection_mode, wifi_mode FROM mobile_scanner_settings WHERE company_id = $1 AND store_id = $2",
        [req.user.companyId, req.user.storeId]
      );
      const connectionMode = config.rows[0]?.connection_mode || "WIFI_QR";
      const wifiMode = config.rows[0]?.wifi_mode || "LOCAL_ONLY";
      if (connectionMode !== "WIFI_QR") return res.status(409).json({ success: false, message: "Selected scanner connection mode is not supported" });
      const allowed = await db(
        `SELECT t.id FROM terminals t INNER JOIN stores s ON s.id = t.store_id
         WHERE t.id = $1 AND t.store_id = $2 AND s.company_id = $3 AND t.active = TRUE AND s.active = TRUE`,
        [terminalId, req.user.storeId, req.user.companyId]
      );
      if (!allowed.rows[0]) return res.status(400).json({ success: false, message: "Till is not available in the active store" });

      const recent = await db(
        `SELECT COUNT(*)::int AS count FROM mobile_scanner_sessions
         WHERE company_id = $1 AND created_by = $2 AND created_at > NOW() - INTERVAL '1 minute'`,
        [req.user.companyId, req.user.id]
      );
      if (Number(recent.rows[0]?.count || 0) >= 5) {
        return res.status(429).json({ success: false, message: "Too many pairing requests. Try again shortly." });
      }

      const pairingToken = newToken("pair_");
      const created = await db(
        `INSERT INTO mobile_scanner_sessions
           (company_id, store_id, terminal_id, created_by, pairing_token_hash, pairing_expires_at, wifi_mode)
         VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${PAIRING_TTL_MINUTES} minutes', $6)
         RETURNING id, store_id, terminal_id, wifi_mode, pairing_expires_at, created_at`,
        [req.user.companyId, req.user.storeId, terminalId, req.user.id, hashToken(pairingToken), wifiMode]
      );
      if (typeof writeAudit === "function") {
        Promise.resolve(writeAudit(req.user.companyId, req.user.id, "mobile_scanner.pairing_created", "mobile_scanner", created.rows[0].id, { terminalId, wifiMode })).catch(() => {});
      }
      return res.status(201).json({ success: true, data: { ...created.rows[0], pairingToken, permission: "SEND_BARCODE_EVENT" } });
    } catch (error) {
      console.error("Create mobile scanner pairing error:", error);
      return res.status(500).json({ success: false, message: "Unable to create scanner pairing" });
    }
  });

  router.get("/mobile-scanner/pairings", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const result = await db(
        `SELECT ms.id, ms.store_id, ms.terminal_id, ms.wifi_mode, ms.created_at,
                ms.last_seen_at, ms.revoked_at, ms.session_expires_at,
                t.name AS till_name, ms.device_name,
                (ms.session_token_hash IS NOT NULL AND ms.revoked_at IS NULL AND ms.session_expires_at > NOW()) AS connected
         FROM mobile_scanner_sessions ms
         INNER JOIN terminals t ON t.id = ms.terminal_id
         WHERE ms.company_id = $1 AND ms.store_id = $2
         ORDER BY ms.created_at DESC LIMIT 50`,
        [req.user.companyId, req.user.storeId]
      );
      return res.json({ success: true, data: result.rows });
    } catch (error) {
      console.error("List mobile scanner pairings error:", error);
      return res.status(500).json({ success: false, message: "Unable to load scanner sessions" });
    }
  });

  router.delete("/mobile-scanner/pairings/:id", authenticate, authorize("integration.manage"), async (req, res) => {
    try {
      const result = await db(
        `UPDATE mobile_scanner_sessions SET revoked_at = NOW(), pairing_token_hash = NULL, session_token_hash = NULL
         WHERE id = $1 AND company_id = $2 AND store_id = $3 AND revoked_at IS NULL RETURNING id`,
        [req.params.id, req.user.companyId, req.user.storeId]
      );
      return result.rows[0]
        ? res.json({ success: true })
        : res.status(404).json({ success: false, message: "Scanner session not found" });
    } catch (error) {
      console.error("Revoke mobile scanner pairing error:", error);
      return res.status(500).json({ success: false, message: "Unable to revoke scanner session" });
    }
  });

  router.post("/mobile-scanner/session", async (req, res) => {
    const pairingToken = typeof req.body?.pairingToken === "string" ? req.body.pairingToken : "";
    if (!pairingToken.startsWith("pair_")) return res.status(401).json({ success: false, message: "Valid pairing token required" });
    const sessionToken = newToken("scn_");
    try {
      const paired = await db(
        `UPDATE mobile_scanner_sessions
         SET pairing_token_hash = NULL, pairing_consumed_at = NOW(),
             session_token_hash = $2, session_expires_at = NOW() + INTERVAL '${SESSION_TTL_HOURS} hours',
             last_seen_at = NOW()
         WHERE pairing_token_hash = $1 AND pairing_consumed_at IS NULL
           AND pairing_expires_at > NOW() AND revoked_at IS NULL
         RETURNING id, store_id, terminal_id, wifi_mode`,
        [hashToken(pairingToken), hashToken(sessionToken)]
      );
      if (!paired.rows[0]) return res.status(410).json({ success: false, message: "Pairing link expired or already used" });
      return res.status(201).json({ success: true, data: { sessionToken, permission: "SEND_BARCODE_EVENT", expiresInSeconds: SESSION_TTL_HOURS * 3600 } });
    } catch (error) {
      console.error("Establish mobile scanner session error:", error);
      return res.status(500).json({ success: false, message: "Unable to establish scanner session" });
    }
  });

  router.get("/mobile-scanner/session", requireScannerSession, async (req, res) => {
    await db("UPDATE mobile_scanner_sessions SET last_seen_at = NOW() WHERE id = $1", [req.mobileScanner.id]);
    return res.json({ success: true, data: { connected: true, tillName: req.mobileScanner.till_name, permission: "SEND_BARCODE_EVENT" } });
  });

  router.post("/mobile-scanner/events", requireScannerSession, async (req, res) => {
    const barcode = typeof req.body?.barcode === "string" ? req.body.barcode.trim() : "";
    if (!barcode || barcode.length > BARCODE_MAX_LENGTH || !/^[\x20-\x7E]+$/.test(barcode)) {
      return res.status(400).json({ success: false, message: "A valid barcode is required" });
    }
    try {
      const recent = await db(
        `SELECT COUNT(*)::int AS count FROM mobile_scanner_events
         WHERE scanner_session_id = $1 AND created_at > NOW() - INTERVAL '1 minute'`,
        [req.mobileScanner.id]
      );
      if (Number(recent.rows[0]?.count || 0) >= 120) return res.status(429).json({ success: false, message: "Scanner rate limit reached" });
      const result = await db(
        `INSERT INTO mobile_scanner_events (scanner_session_id, company_id, store_id, terminal_id, barcode)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [req.mobileScanner.id, req.mobileScanner.company_id, req.mobileScanner.store_id, req.mobileScanner.terminal_id, barcode]
      );
      await db("UPDATE mobile_scanner_sessions SET last_seen_at = NOW() WHERE id = $1", [req.mobileScanner.id]);
      return res.status(202).json({ success: true, data: { acknowledged: true, eventId: result.rows[0].id } });
    } catch (error) {
      console.error("Transmit mobile scanner event error:", error);
      return res.status(500).json({ success: false, message: "Unable to send barcode" });
    }
  });

  router.delete("/mobile-scanner/session", requireScannerSession, async (req, res) => {
    await db("UPDATE mobile_scanner_sessions SET revoked_at = NOW(), session_token_hash = NULL WHERE id = $1", [req.mobileScanner.id]);
    return res.json({ success: true, data: { disconnected: true } });
  });

  router.get("/mobile-scanner/events", authenticate, authorize("sale.create"), async (req, res) => {
    const terminalId = String(req.query.terminalId || "");
    if (!terminalId) return res.status(400).json({ success: false, message: "Till assignment required" });
    try {
      const activeTill = await db(
        `SELECT id FROM till_sessions WHERE company_id = $1 AND store_id = $2 AND terminal_id = $3
         AND user_id = $4 AND status = 'open' LIMIT 1`,
        [req.user.companyId, req.user.storeId, terminalId, req.user.id]
      );
      if (!activeTill.rows[0]) return res.status(403).json({ success: false, message: "Open the assigned till to receive scanner events" });
      const events = await db(
        `WITH pending AS (
           SELECT e.id FROM mobile_scanner_events e
           INNER JOIN mobile_scanner_sessions ms ON ms.id = e.scanner_session_id
           WHERE e.company_id = $1 AND e.store_id = $2 AND e.terminal_id = $3
             AND e.delivered_at IS NULL AND ms.revoked_at IS NULL
           ORDER BY e.created_at LIMIT 20 FOR UPDATE OF e SKIP LOCKED
         )
         UPDATE mobile_scanner_events e SET delivered_at = NOW()
         FROM pending WHERE e.id = pending.id
         RETURNING e.id, e.barcode, e.created_at`,
        [req.user.companyId, req.user.storeId, terminalId]
      );
      return res.json({ success: true, data: events.rows });
    } catch (error) {
      console.error("Poll mobile scanner events error:", error);
      return res.status(500).json({ success: false, message: "Unable to load scanner events" });
    }
  });

  return router;
}