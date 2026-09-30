import express from "express";
import {
  getGoogleConnectRuntime,
  publicGoogleConnectConfig,
  saveGoogleConnectConfiguration,
} from "../services/googleConnect.js";

export default function createGoogleConnectRouter({ authenticate, authorize, db }) {
  const router = express.Router();

  router.get(
    "/google-connect/config",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const runtime = await getGoogleConnectRuntime(db, req.user.companyId);
        res.json({ success: true, data: publicGoogleConnectConfig(runtime) });
      } catch (error) {
        console.error("Google Connect config load error:", error);
        res.status(500).json({ success: false, message: "Unable to load Google Connect settings" });
      }
    }
  );

  router.put(
    "/google-connect/config",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const runtime = await saveGoogleConnectConfiguration(
          db,
          req.user.companyId,
          req.user.id,
          req.body || {}
        );
        res.json({ success: true, data: publicGoogleConnectConfig(runtime) });
      } catch (error) {
        const status = error?.code === "FEATURE_NOT_LICENSED" ? 403 : 400;
        res.status(status).json({
          success: false,
          code: error?.code || "GOOGLE_CONNECT_CONFIG_INVALID",
          message: error?.message || "Unable to save Google Connect settings",
        });
      }
    }
  );

  router.post(
    "/google-connect/test",
    authenticate,
    authorize("integration.manage"),
    async (req, res) => {
      try {
        const runtime = await getGoogleConnectRuntime(db, req.user.companyId);
        if (!runtime.licensed || !runtime.installed) {
          return res.status(403).json({
            success: false,
            code: "FEATURE_NOT_LICENSED",
            message: "Google Connect licence is not available for this company",
          });
        }
        if (!runtime.config?.clientId || !runtime.config?.clientSecret || !runtime.config?.redirectUri) {
          return res.status(400).json({
            success: false,
            code: "GOOGLE_CONNECT_NOT_CONFIGURED",
            message: "Google OAuth Client ID, Client Secret and Redirect URI are required",
          });
        }

        const started = Date.now();
        const response = await fetch("https://accounts.google.com/.well-known/openid-configuration");
        if (!response.ok) throw new Error(`Google OpenID discovery returned HTTP ${response.status}`);
        const discovery = await response.json();
        if (!discovery?.authorization_endpoint || !discovery?.token_endpoint) {
          throw new Error("Google OpenID discovery response is incomplete");
        }

        res.json({
          success: true,
          data: {
            ok: true,
            configured: true,
            ready: runtime.ready,
            durationMs: Date.now() - started,
            message: runtime.ready
              ? "Google Connect configuration is ready. Use Test Google Login for end-to-end OAuth."
              : "Configuration is saved but SSO is not enabled.",
          },
        });
      } catch (error) {
        console.error("Google Connect test error:", error);
        res.status(502).json({
          success: false,
          message: error?.message || "Google Connect test failed",
        });
      }
    }
  );

  return router;
}
