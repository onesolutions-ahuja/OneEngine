import crypto from "node:crypto";
import { buildInvoicePdf } from "../utils/invoicePdf.js";

export const RECEIPT_QR_DEFAULTS = Object.freeze({
  showAfterSuccessfulPayment: "OFF",
  expiryMinutes: 5,
  allowManualQr: true,
  allowRegenerate: true,
  autoCloseOnNewSale: true,
  showCountdown: true,
  downloadFilenameFormat: "receipt-{receipt_number}.pdf",
});

export function getReceiptQrSettingDefaults() {
  return { ...RECEIPT_QR_DEFAULTS };
}

export function normaliseReceiptQrSettings(settings = {}) {
  const next = getReceiptQrSettingDefaults();
  const mode = String(settings.showAfterSuccessfulPayment || settings.show_after_successful_payment || next.showAfterSuccessfulPayment).trim().toUpperCase();
  next.showAfterSuccessfulPayment = ["OFF", "ALWAYS", "ONLY_WHEN_PRINTER_UNAVAILABLE"].includes(mode) ? mode : "OFF";
  next.expiryMinutes = Number.isFinite(Number(settings.expiryMinutes ?? settings.expiry_minutes)) ? Math.max(1, Number(settings.expiryMinutes ?? settings.expiry_minutes)) : next.expiryMinutes;
  next.allowManualQr = settings.allowManualQr ?? settings.allow_manual_qr ?? next.allowManualQr;
  next.allowRegenerate = settings.allowRegenerate ?? settings.allow_regenerate ?? next.allowRegenerate;
  next.autoCloseOnNewSale = settings.autoCloseOnNewSale ?? settings.auto_close_on_new_sale ?? next.autoCloseOnNewSale;
  next.showCountdown = settings.showCountdown ?? settings.show_countdown ?? next.showCountdown;
  next.downloadFilenameFormat = typeof (settings.downloadFilenameFormat ?? settings.download_filename_format) === "string" && (settings.downloadFilenameFormat ?? settings.download_filename_format).trim()
    ? (settings.downloadFilenameFormat ?? settings.download_filename_format).trim()
    : next.downloadFilenameFormat;
  return next;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token), "utf8").digest("hex");
}

export function generateReceiptQrToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export async function resolveReceiptQrSettings(db, companyId) {
  if (!db || !companyId) return getReceiptQrSettingDefaults();
  try {
    const result = await db(
      `SELECT receipt_qr_show_after_payment, receipt_qr_expiry_minutes, receipt_qr_allow_manual, receipt_qr_allow_regenerate,
              receipt_qr_auto_close_on_new_sale, receipt_qr_show_countdown, receipt_qr_download_filename_format
       FROM company_settings WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );
    const row = result.rows?.[0] || {};
    return normaliseReceiptQrSettings({
      showAfterSuccessfulPayment: row.receipt_qr_show_after_payment,
      expiryMinutes: row.receipt_qr_expiry_minutes,
      allowManualQr: row.receipt_qr_allow_manual,
      allowRegenerate: row.receipt_qr_allow_regenerate,
      autoCloseOnNewSale: row.receipt_qr_auto_close_on_new_sale,
      showCountdown: row.receipt_qr_show_countdown,
      downloadFilenameFormat: row.receipt_qr_download_filename_format,
    });
  } catch {
    return getReceiptQrSettingDefaults();
  }
}

export async function createTemporaryReceiptDownload({
  db,
  companyId,
  storeId = null,
  tillId = null,
  saleId,
  expiryMinutes = 5,
  token = null,
}) {
  if (!db || !companyId || !saleId) {
    return { ok: false, status: 400, message: "db, companyId and saleId are required" };
  }

  const plaintext = token || generateReceiptQrToken();
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + Math.max(1, Number(expiryMinutes) || 5) * 60 * 1000);

  try {
    const result = await db(
      `INSERT INTO temporary_receipt_downloads
       (company_id, store_id, till_id, sale_id, token_hash, status, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW(), $6)
       ON CONFLICT (token_hash) DO UPDATE SET
         company_id = EXCLUDED.company_id,
         store_id = EXCLUDED.store_id,
         till_id = EXCLUDED.till_id,
         sale_id = EXCLUDED.sale_id,
         status = 'ACTIVE',
         expires_at = EXCLUDED.expires_at,
         downloaded_at = NULL,
         revoked_at = NULL,
         updated_at = NOW()
       RETURNING id, company_id, store_id, till_id, sale_id, status, created_at, expires_at`,
      [companyId, storeId, tillId, saleId, tokenHash, expiresAt]
    );
    const row = result.rows?.[0] || {};
    return {
      ok: true,
      id: row.id || null,
      saleId,
      token: plaintext,
      expiresAt: row.expires_at ? new Date(row.expires_at) : expiresAt,
      status: row.status || "ACTIVE",
    };
  } catch (error) {
    return { ok: false, status: 500, message: error?.message || "Unable to create temporary receipt download" };
  }
}

export async function validateTemporaryReceiptDownload({ db, token }) {
  const generic = { ok: false, status: 404, message: "This receipt link has expired or is no longer available." };
  if (!db || typeof token !== "string" || !token.trim()) return generic;

  try {
    const row = await db(
      `SELECT id, company_id, store_id, till_id, sale_id, token_hash, status, created_at, expires_at, downloaded_at, revoked_at
       FROM temporary_receipt_downloads WHERE token_hash = $1 LIMIT 1`,
      [hashToken(token)]
    );
    const receipt = row.rows?.[0];
    if (!receipt) return generic;
    if (receipt.status === "REVOKED" || receipt.status === "EXPIRED") return generic;
    if (receipt.revoked_at || (receipt.expires_at && new Date(receipt.expires_at).getTime() <= Date.now())) {
      await db(
        `UPDATE temporary_receipt_downloads SET status='EXPIRED', updated_at=NOW() WHERE id=$1`,
        [receipt.id]
      );
      return generic;
    }
    return { ok: true, receipt };
  } catch {
    return generic;
  }
}

export async function revokeTemporaryReceiptDownload({ db, companyId, receiptId }) {
  if (!db || !companyId || !receiptId) return { ok: false, revoked: 0 };
  try {
    const result = await db(
      `UPDATE temporary_receipt_downloads
       SET status='REVOKED', revoked_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND company_id=$2 AND status IN ('ACTIVE', 'DOWNLOADED')`,
      [receiptId, companyId]
    );
    return { ok: true, revoked: Number(result.rowCount || 0) };
  } catch {
    return { ok: false, revoked: 0 };
  }
}

export async function revokeTemporaryReceiptDownloadsForSale({ db, companyId, saleId }) {
  if (!db || !companyId || !saleId) return { ok: false, revoked: 0 };
  try {
    const result = await db(
      `UPDATE temporary_receipt_downloads
       SET status='REVOKED', revoked_at=NOW(), updated_at=NOW()
       WHERE company_id=$1 AND sale_id=$2 AND status IN ('ACTIVE', 'DOWNLOADED')`,
      [companyId, saleId]
    );
    return { ok: true, revoked: Number(result.rowCount || 0) };
  } catch {
    return { ok: false, revoked: 0 };
  }
}

export async function markTemporaryReceiptDownloaded({ db, receiptId }) {
  if (!db || !receiptId) return false;
  try {
    await db(
      `UPDATE temporary_receipt_downloads SET status='DOWNLOADED', downloaded_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [receiptId]
    );
    return true;
  } catch {
    return false;
  }
}

export async function cleanupExpiredTemporaryReceipts(db) {
  if (!db) return { ok: true, cleaned: 0 };
  try {
    const result = await db(
      `UPDATE temporary_receipt_downloads SET status='EXPIRED', updated_at=NOW()
       WHERE status IN ('ACTIVE', 'DOWNLOADED') AND expires_at IS NOT NULL AND expires_at <= NOW()`,
    );
    return { ok: true, cleaned: Number(result.rowCount || 0) };
  } catch {
    return { ok: false, cleaned: 0 };
  }
}

export async function loadPublicReceiptData({ db, companyId, saleId }) {
  if (!db || !companyId || !saleId) return null;
  try {
    const saleResult = await db(
      `SELECT s.*, st.name AS store_name, st.address_line1, st.address_line2, st.city, st.postcode, st.phone AS store_phone,
              u.username AS cashier, cst.name AS customer_name, cst.phone AS customer_phone, cst.email AS customer_email,
              c.name AS company_name, c.email AS company_email, c.phone AS company_phone, c.currency AS company_currency, c.timezone AS company_timezone
       FROM sale_ledger s
       LEFT JOIN stores st ON st.id = s.store_id
       LEFT JOIN companies c ON c.id = s.company_id
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN customers cst ON cst.id = s.customer_id
       WHERE s.id = $1 AND s.company_id = $2 LIMIT 1`,
      [saleId, companyId]
    );
    if (!saleResult.rows?.[0]) return null;
    const sale = saleResult.rows[0];
    const items = await db("SELECT * FROM sale_items WHERE sale_id = $1 ORDER BY id ASC", [saleId]);
    const payments = await db("SELECT payment_method, amount, status FROM payments WHERE sale_id = $1 ORDER BY created_at ASC", [saleId]);
    return {
      company: {
        name: sale.company_name || "onePOS",
        email: sale.company_email || null,
        phone: sale.company_phone || null,
      },
      store: {
        name: sale.store_name || "Store",
        phone: sale.store_phone || null,
        addressLine1: sale.address_line1 || null,
        city: sale.city || null,
        postcode: sale.postcode || null,
      },
      sale: {
        ...sale,
        receiptNumber: sale.receipt_number || sale.id,
        createdAt: sale.created_at,
        completedAt: sale.completed_at || sale.created_at,
        companyCurrency: sale.company_currency || "GBP",
        companyTimezone: sale.company_timezone || "Europe/London",
        subtotal: Number(sale.subtotal || 0),
        tax: Number(sale.tax || 0),
        discount: Number(sale.discount || 0),
        total: Number(sale.total || 0),
        items: (items.rows || []).map((item) => ({
          name: item.product_name || item.description || "Item",
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unit_price || 0),
          discount: Number(item.discount || 0),
          tax: Number(item.tax || 0),
          total: Number(item.total || 0),
        })),
        payments: (payments.rows || []).map((pay) => ({
          method: pay.payment_method || "Unknown",
          amount: Number(pay.amount || 0),
        })),
      },
    };
  } catch {
    return null;
  }
}

export function buildReceiptQrDownloadUrl(token, baseUrl = null) {
  if (!token) return "/receipt/download/";
  const prefix = typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.replace(/\/+$/, "") : "";
  return `${prefix || ""}/receipt/download/${encodeURIComponent(token)}`;
}

export function buildReceiptPdfBytes({ sale, company, store }) {
  return buildInvoicePdf({ sale, company, store });
}
