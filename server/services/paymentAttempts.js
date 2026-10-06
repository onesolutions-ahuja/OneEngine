import { randomUUID } from "node:crypto";
import { publishPlatformEvent } from "./platformEvents.js";
import { resolvePersistedConnectorCapability } from "./connectorRuntime.js";

const TERMINAL_STATUSES = new Set(["APPROVED", "DECLINED", "CANCELLED", "EXPIRED", "FAILED"]);

function rowToAttempt(row) {
  if (!row) return null;
  return {
    id: row.id,
    paymentAttemptId: row.id,
    companyId: row.company_id,
    storeId: row.store_id,
    tillId: row.till_id,
    saleId: row.sale_id || null,
    sessionReference: row.session_reference || null,
    connectorInstanceId: row.connector_instance_id || null,
    connectorPackageKey: row.connector_package_key,
    environment: row.environment,
    amount: Number(row.amount),
    currency: row.currency,
    providerReference: row.provider_reference || null,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    qrUrl: row.qr_url || null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPaymentAttempt(db, { companyId, attemptId, storeId = null, tillId = null }) {
  const params = [attemptId, companyId];
  const clauses = ["id=$1", "company_id=$2"];
  if (storeId) { params.push(storeId); clauses.push(`store_id=$${params.length}`); }
  if (tillId) { params.push(tillId); clauses.push(`till_id=$${params.length}`); }
  const result = await db(`SELECT * FROM payment_attempts WHERE ${clauses.join(" AND ")} LIMIT 1`, params);
  return rowToAttempt(result.rows[0]);
}

export async function createPaymentAttempt({ db, connectorDrivers, companyId, storeId, tillId, saleId = null, sessionReference = null, amount, currency = "GBP", idempotencyKey, expiresInSeconds = 300, actorUserId = null }) {
  if (!companyId || !storeId || !tillId) throw new Error("Payment attempt requires company, store, and till scope");
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error("Payment attempt requires a positive amount");
  if (!idempotencyKey) throw new Error("Payment attempt requires an idempotency key");
  const existing = await db("SELECT * FROM payment_attempts WHERE company_id=$1 AND idempotency_key=$2 LIMIT 1", [companyId, idempotencyKey]);
  if (existing.rows[0]) return rowToAttempt(existing.rows[0]);
  const resolved = await resolvePersistedConnectorCapability({
    db, drivers: connectorDrivers, companyId, storeId, tillId, capabilityKey: "payment.sale",
    payload: { amount: Number(amount), currency: String(currency).toUpperCase(), idempotencyKey, reference: idempotencyKey, terminalId: tillId },
    actorUserId,
  });
  if (!resolved.available) throw Object.assign(new Error(resolved.message || "Payment connector is unavailable"), { code: resolved.code || "CONNECTOR_UNAVAILABLE" });
  const result = resolved.result || {};
  const environment = result.demoMode ? "DEMO" : String(result.environment || "SANDBOX").toUpperCase();
  const expiresAt = new Date(Date.now() + Math.max(30, Number(expiresInSeconds) || 300) * 1000);
  const inserted = await db(
    `INSERT INTO payment_attempts(company_id,store_id,till_id,sale_id,session_reference,connector_instance_id,connector_package_key,environment,amount,currency,provider_reference,idempotency_key,status,qr_url,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [companyId, storeId, tillId, saleId, sessionReference, resolved.connectorInstanceId, resolved.connectorPackageKey || null, environment, Number(amount), String(currency).toUpperCase(), result.providerTransactionId || null, idempotencyKey, result.status || "PENDING", result.qrUrl || null, expiresAt]
  );
  const attempt = rowToAttempt(inserted.rows[0]);
  await publishPlatformEvent({ db, companyId, eventType: "payment.pending", payload: { paymentAttemptId: attempt.id, storeId, tillId, amount: attempt.amount, currency: attempt.currency, providerReference: attempt.providerReference, environment }, actorUserId, idempotencyKey: `payment-attempt:${attempt.id}:pending` });
  return attempt;
}

export async function transitionPaymentAttempt({ db, companyId, attemptId, status, actorUserId = null, providerReference = undefined, amount = undefined, currency = undefined }) {
  const next = String(status || "").toUpperCase();
  if (!TERMINAL_STATUSES.has(next) && next !== "PENDING") throw new Error("Unsupported payment attempt status");
  const current = await getPaymentAttempt(db, { companyId, attemptId });
  if (!current) return null;
  if (TERMINAL_STATUSES.has(current.status)) return current;
  if (amount !== undefined && Number(amount) !== current.amount) throw new Error("Payment amount mismatch");
  if (currency !== undefined && String(currency).toUpperCase() !== current.currency) throw new Error("Payment currency mismatch");
  const result = await db("UPDATE payment_attempts SET status=$1, provider_reference=COALESCE($2,provider_reference), updated_at=NOW() WHERE id=$3 AND company_id=$4 RETURNING *", [next, providerReference ?? null, attemptId, companyId]);
  const attempt = rowToAttempt(result.rows[0]);
  if (attempt && next !== "PENDING") {
    await publishPlatformEvent({ db, companyId, eventType: `payment.${next.toLowerCase()}`, payload: { paymentAttemptId: attempt.id, storeId: attempt.storeId, tillId: attempt.tillId, amount: attempt.amount, currency: attempt.currency, providerReference: attempt.providerReference, status: next }, actorUserId, idempotencyKey: `payment-attempt:${attempt.id}:${next.toLowerCase()}` });
  }
  return attempt;
}

export async function expirePaymentAttempts(db, { now = new Date() } = {}) {
  const result = await db("UPDATE payment_attempts SET status='EXPIRED', updated_at=NOW() WHERE status='PENDING' AND expires_at <= $1 RETURNING id, company_id", [now]);
  return result.rows || [];
}
