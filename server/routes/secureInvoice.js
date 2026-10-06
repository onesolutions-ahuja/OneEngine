/*
 * T9P - Secure invoice link routes (backend foundation).
 *
 * PUBLIC:  GET /i/:token      - the customer-facing invoice download.
 *          The URL path deliberately sits outside /api (no auth header, no
 *          API surface) and carries no IDs: the opaque token is the sole
 *          credential and the sole lookup key (hash-only storage).
 *
 * ADMIN:   GET/DELETE under /api/sales/:saleId/secure-links so the existing
 *          sales permission model can create/revoke links in a later batch.
 *
 * Enumeration protection: invalid, expired, revoked and unknown tokens all
 * receive the SAME generic 404 with no distinction and no identifiers.
 * The route never accepts a saleId/invoiceId from the URL as an override -
 * the sale is loaded exclusively through the token relationship.
 */
import express from "express";
import { escapeHtml } from "../utils/invoiceHtml.js";
import {
  validateSecureInvoiceToken,
  createSecureInvoiceLink,
  revokeSecureInvoiceLinksForSale,
  recordSecureInvoiceAccess,
  SECURE_LINK_DEFAULT_EXPIRY_DAYS,
} from "../services/secureInvoiceLinks.js";
import {
  validateTemporaryReceiptDownload,
  markTemporaryReceiptDownloaded,
  buildReceiptPdfBytes,
  loadPublicReceiptData,
} from "../services/receiptQr.js";
import { executeSystemWorkflow } from "../services/systemWorkflowRuntime.js";

const GENERIC_404 = { success: false, message: "This link is invalid, has expired, or has been revoked." };

/* Fixed generic page so every rejection is byte-identical (no timing or
 * content differences between invalid/expired/revoked). */
function genericNotFound(res) {
  return res
    .status(404)
    .type("html")
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Link not available</title></head><body style="font-family:system-ui,sans-serif;background:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;max-width:420px;text-align:center"><h1 style="font-size:18px;color:#0f172a;margin:0 0 8px">Link not available</h1><p style="font-size:14px;color:#475569;margin:0">This link is invalid, has expired, or has been revoked. Please ask for a new link.</p></div></body></html>`);
}

/* In-memory fixed-window rate limiter (no new dependencies). Per IP+token
 * bucket: protects the hash lookup from brute-force sweeping. Tokens are
 * 256-bit random, so this is defence in depth, not the primary control. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.reset) {
    rateBuckets.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    if (rateBuckets.size > 5000) {
      for (const [key, value] of rateBuckets) {
        if (value.reset < now) rateBuckets.delete(key);
      }
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

/* ---------- Invoice document (HTML; print-to-PDF ready) ---------- */

function buildInvoiceHtml({ sale, company, store }) {
  const money = (value) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: sale.company_currency || "GBP" }).format(Number(value) || 0);
  const dateTime = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short",
  }).format(new Date(sale.completed_at || sale.created_at));

  const lines = (sale.items || [])
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${money(item.unitPrice)}</td>
          <td class="num">${money(item.discount)}</td>
          <td class="num">${money(item.tax)}</td>
          <td class="num">${money(item.total)}</td>
        </tr>`
    )
    .join("");

  const payments = (sale.payments || [])
    .map((pay) => `<span class="pill">${escapeHtml(pay.method)}${pay.amount != null ? ` · ${money(pay.amount)}` : ""}</span>`)
    .join(" ") || "—";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Invoice ${escapeHtml(sale.receipt_number || "")}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; background: #f1f5f9; margin: 0; padding: 24px; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px 32px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; gap: 16px; }
  .brand h1 { font-size: 20px; margin: 0 0 4px; }
  .brand p { margin: 0; font-size: 12px; color: #475569; }
  .meta { text-align: right; font-size: 12px; color: #475569; }
  .meta .inv { font-size: 15px; font-weight: 700; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th { text-align: left; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 7px 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
  td { border-bottom: 1px solid #f1f5f9; padding: 7px 8px; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin-top: 14px; margin-left: auto; width: 260px; font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .pills { margin-top: 12px; font-size: 12px; color: #475569; }
  .pill { display: inline-block; border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 999px; padding: 3px 10px; margin-right: 6px; }
  footer { margin-top: 22px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
  .no-print { text-align: center; margin-top: 14px; }
  .no-print button { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 18px; font-size: 13px; cursor: pointer; }
  @media print { body { background: #fff; padding: 0; } .no-print { display: none; } .sheet { border: none; } }
</style>
</head>
<body>
  <div class="sheet">
    <header>
      <div class="brand">
        <h1>${escapeHtml(company?.name || "Invoice")}</h1>
        <p>${[store?.name, company?.email, company?.phone].filter(Boolean).map(escapeHtml).join(" · ")}</p>
      </div>
      <div class="meta">
        <div class="inv">Receipt ${escapeHtml(sale.receipt_number || "—")}</div>
        <div>${escapeHtml(dateTime)}</div>
      </div>
    </header>
    <table>
      <thead>
        <tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Disc</th><th class="num">VAT</th><th class="num">Total</th></tr>
      </thead>
      <tbody>${lines || `<tr><td colspan="7" style="text-align:center;color:#94a3b8">No line items</td></tr>`}</tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${money(sale.subtotal)}</span></div>
      <div><span>Discount</span><span>−${money(sale.discount)}</span></div>
      <div><span>VAT</span><span>${money(sale.tax)}</span></div>
      <div class="grand"><span>Total</span><span>${money(sale.total)}</span></div>
    </div>
    <div class="pills"><strong>Payment:</strong> ${payments}</div>
    <footer>This document was accessed via a secure, single-purpose link. If you did not expect it, please contact the store.</footer>
  </div>
  <div class="no-print"><button onclick="window.print()">Save as PDF / Print</button></div>
</body>
</html>`;
}

/* ---------- Router ---------- */

export default function createSecureInvoiceRouter({ db, pool, authenticate, authorize, writeAudit }) {
  const router = express.Router();

  /* ---------------- PUBLIC: the secure download link ---------------- */
  router.get("/i/:token", async (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    if (rateLimited(ip)) {
      return genericNotFound(res); // same generic 404 body, never a distinct "rate limited" signal
    }

    const token = String(req.params.token || "");
    // Cheap structural pre-check: base64url of 32 bytes is always 43 chars.
    // Malformed URLs get the identical generic 404 without touching the DB.
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return genericNotFound(res);

    const validated = await validateSecureInvoiceToken({ db, token, includeSale: true });
    if (!validated.ok) return genericNotFound(res);

    const { link, sale } = validated;

    // Company/store documents for the header of THIS sale only.
    let company = null;
    let store = null;
    try {
      const companyResult = await db(
        `SELECT name, email, phone, currency FROM companies WHERE id = $1 LIMIT 1`,
        [sale.company_id]
      );
      company = companyResult.rows[0] || null;
      const storeResult = await db(
        `SELECT name, phone, address_line1, city, postcode FROM stores WHERE id = $1 LIMIT 1`,
        [sale.store_id]
      );
      store = storeResult.rows[0] || null;
    } catch {
      /* header info is decorative - never block the document */
    }

    const html = buildInvoiceHtml({ sale, company, store });
    recordSecureInvoiceAccess({ db, linkId: link.id });

    res
      .status(200)
      .type("html")
      .set("Cache-Control", "no-store, max-age=0")
      .set("X-Robots-Tag", "noindex, nofollow")
      .set("Referrer-Policy", "no-referrer")
      .send(html);
  });

  router.get("/receipt/download/:token", async (req, res) => {
    const token = String(req.params.token || "");
    if (!token.trim()) return genericNotFound(res);

    const validated = await validateTemporaryReceiptDownload({ db, token });
    if (!validated.ok || !validated.receipt) return genericNotFound(res);

    const receiptData = await loadPublicReceiptData({ db, companyId: validated.receipt.company_id, saleId: validated.receipt.sale_id });
    if (!receiptData || !receiptData.sale) return genericNotFound(res);

    const pdf = buildReceiptPdfBytes({
      sale: receiptData.sale,
      company: receiptData.company,
      store: receiptData.store,
    });

    await markTemporaryReceiptDownloaded({ db, receiptId: validated.receipt.id });

    const filename = `receipt-${String(receiptData.sale.receiptNumber || validated.receipt.sale_id).replace(/[^a-zA-Z0-9._-]/g, "") || "receipt"}.pdf`;
    res
      .status(200)
      .type("application/pdf")
      .set("Content-Disposition", `attachment; filename="${filename}"`)
      .set("Cache-Control", "no-store, max-age=0")
      .set("X-Robots-Tag", "noindex, nofollow")
      .set("Referrer-Policy", "no-referrer")
      .send(Buffer.from(pdf));
  });

  /* ---------------- ADMIN: link management for later batches ---------------- */

  const metadataRequired=(_req,res)=>res.status(410).json({success:false,code:"METADATA_ACTION_REQUIRED",message:"Receipt/invoice link business actions execute through metadata Actions/Flows; secure-token validation remains protocol infrastructure."});
  router.post("/receipt-qr",authenticate,authorize("sale.view"),metadataRequired);
  router.post("/secure-invoice",authenticate,authorize("sale.view"),metadataRequired);
  router.delete("/receipt-qr/:saleId",authenticate,authorize("sale.view"),metadataRequired);
  router.delete("/secure-invoice/:saleId",authenticate,authorize("sale.view"),metadataRequired);
  return router;
}
