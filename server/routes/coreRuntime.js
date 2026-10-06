import express from "express";
import { issueAccountToken } from "../services/accountPolicy.js";
import {
  buildReceiptQrDownloadUrl,
  createTemporaryReceiptDownload,
  resolveReceiptQrSettings,
  revokeTemporaryReceiptDownloadsForSale,
} from "../services/receiptQr.js";

function requestBaseUrl(req) {
  const protocol = String(req.headers?.["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim() || "https";
  return `${protocol}://${req.get("host")}`;
}

export default function createCoreRuntimeRouter({ authenticate, authorize, db }) {
  const router = express.Router();

  router.post("/platform/runtime/security/tokens", authenticate, authorize("user.manage"), async (req, res) => {
    const subjectType = String(req.body?.subjectType || "USER").trim().toUpperCase();
    const subjectId = String(req.body?.subjectId || "").trim();
    const purpose = String(req.body?.purpose || "").trim().toUpperCase();
    const requestedExpiry = Number(req.body?.expiresMinutes);
    if (subjectType !== "USER" || !subjectId || !purpose) {
      return res.status(400).json({ success: false, message: "Token subject and purpose are required" });
    }
    const expiresMinutes = Number.isFinite(requestedExpiry) && requestedExpiry > 0
      ? Math.min(Math.floor(requestedExpiry), 10080)
      : 60;
    const token = await issueAccountToken(db, {
      companyId: req.user.companyId,
      userId: subjectId,
      purpose,
      expiresMinutes,
    });
    return res.status(201).json({ success: true, data: { token, subjectId, purpose, expiresMinutes } });
  });

  router.post("/platform/runtime/document-links", authenticate, authorize("sale.view"), async (req, res) => {
    const documentType = String(req.body?.documentType || "").trim().toUpperCase();
    const resourceId = String(req.body?.resourceId || "").trim();
    if (documentType !== "RECEIPT" || !resourceId) {
      return res.status(400).json({ success: false, message: "A supported document type and resource are required" });
    }
    const settings = await resolveReceiptQrSettings(db, req.user.companyId);
    const requestedExpiry = Number(req.body?.expiresMinutes);
    const expiryMinutes = Number.isFinite(requestedExpiry) && requestedExpiry > 0
      ? Math.min(Math.floor(requestedExpiry), 1440)
      : settings.expiryMinutes;
    const result = await createTemporaryReceiptDownload({
      db,
      companyId: req.user.companyId,
      storeId: req.user.storeId || null,
      tillId: req.user.tillId || null,
      saleId: resourceId,
      expiryMinutes,
    });
    if (!result.ok) return res.status(result.status || 500).json({ success: false, message: result.message || "Unable to create document link" });
    const url = buildReceiptQrDownloadUrl(result.token, requestBaseUrl(req));
    return res.status(201).json({
      success: true,
      data: {
        id: result.id,
        resourceId,
        token: result.token,
        url,
        qrcodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`,
        expiresAt: result.expiresAt,
        expiresMinutes: expiryMinutes,
      },
    });
  });

  router.delete("/platform/runtime/document-links", authenticate, authorize("sale.view"), async (req, res) => {
    const documentType = String(req.body?.documentType || "").trim().toUpperCase();
    const resourceId = String(req.body?.resourceId || "").trim();
    if (documentType !== "RECEIPT" || !resourceId) {
      return res.status(400).json({ success: false, message: "A supported document type and resource are required" });
    }
    const result = await revokeTemporaryReceiptDownloadsForSale({
      db,
      companyId: req.user.companyId,
      saleId: resourceId,
    });
    return res.json({ success: true, data: { resourceId, revoked: result.revoked || 0 } });
  });

  return router;
}
