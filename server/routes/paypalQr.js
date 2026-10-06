import express from "express";
import { createPaypalPaymentAttempt, getPaymentAttempt, transitionPaymentAttempt } from "../services/paypalPaymentAttempts.js";

export default function createPaypalQrRouter({ authenticate, authorize, db, connectorDrivers, writeAudit = null }) {
  const router = express.Router();
  const scopedUser = (req) => ({ companyId: req.user.companyId, storeId: req.user.storeId, tillId: req.user.tillId || req.body?.tillId || null });

  router.post("/paypal-qr/attempts", authenticate, authorize("sale.create"), async (req, res) => {
    try {
      const scope = scopedUser(req);
      const attempt = await createPaypalPaymentAttempt({ db, connectorDrivers, companyId: scope.companyId, storeId: scope.storeId, tillId: scope.tillId, saleId: req.body?.saleId || null, sessionReference: req.body?.sessionReference || null, amount: req.body?.amount, currency: req.body?.currency || "GBP", idempotencyKey: req.body?.idempotencyKey, expiresInSeconds: req.body?.expiresInSeconds, actorUserId: req.user.id });
      res.status(201).json({ success: true, data: attempt });
    } catch (error) {
      res.status(error?.code === "CONNECTOR_UNAVAILABLE" ? 503 : 400).json({ success: false, code: error?.code || "PAYMENT_ATTEMPT_FAILED", message: error.message });
    }
  });

  router.get("/paypal-qr/attempts/:id", authenticate, authorize("sale.view", "sale.create"), async (req, res) => {
    const scope = scopedUser(req);
    const attempt = await getPaymentAttempt(db, { companyId: scope.companyId, attemptId: req.params.id, storeId: scope.storeId, tillId: scope.tillId });
    if (!attempt) return res.status(404).json({ success: false, message: "Payment attempt not found" });
    res.json({ success: true, data: attempt });
  });

  router.post("/paypal-qr/attempts/:id/cancel", authenticate, authorize("sale.create"), async (req, res) => {
    try {
      const attempt = await transitionPaymentAttempt({ db, companyId: req.user.companyId, attemptId: req.params.id, status: "CANCELLED", actorUserId: req.user.id });
      if (!attempt || String(attempt.storeId) !== String(req.user.storeId)) return res.status(404).json({ success: false, message: "Payment attempt not found" });
      res.json({ success: true, data: attempt });
    } catch (error) { res.status(400).json({ success: false, code: "PAYMENT_CANCEL_FAILED", message: error.message }); }
  });

  for (const outcome of ["approve", "decline", "cancel", "expire"]) {
    router.post(`/paypal-qr/demo/:id/${outcome}`, async (req, res) => {
      try {
        const status = outcome === "approve" ? "APPROVED" : outcome === "decline" ? "DECLINED" : outcome === "cancel" ? "CANCELLED" : "EXPIRED";
        const attempt = await getPaymentAttempt(db, { companyId: req.body?.companyId || req.query?.companyId, attemptId: req.params.id });
        if (!attempt || attempt.environment !== "DEMO") return res.status(404).json({ success: false, message: "Demo payment attempt not found" });
        await req.ensureBusinessCommandRun?.({ companyId: attempt.companyId, userId: null, storeId: attempt.storeId || null });
        const updated = await transitionPaymentAttempt({ db, companyId: attempt.companyId, attemptId: attempt.id, status, actorUserId: null, amount: attempt.amount, currency: attempt.currency });
        await writeAudit?.(attempt.companyId, null, `paypal_demo.${outcome}`, "payment_attempt", attempt.id, { status, providerReference: attempt.providerReference });
        res.json({ success: true, data: updated });
      } catch (error) { res.status(400).json({ success: false, code: "DEMO_PAYMENT_FAILED", message: error.message }); }
    });
  }

  return router;
}
