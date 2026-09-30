import { createHash } from "node:crypto";

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

export function executionFingerprint(parts = {}) {
  return createHash("sha256").update(stableJson(parts)).digest("hex");
}

export class PlatformExecutionGuardError extends Error {
  constructor(message, { code = "PLATFORM_EXECUTION_GUARD", status = 409, details = null } = {}) {
    super(message);
    this.name = "PlatformExecutionGuardError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createExecutionGuard({
  maxDepth = 8,
  chain = [],
  seen = [],
  idempotencyKey = null,
  scope = null,
} = {}) {
  const normalizedChain = Array.isArray(chain) ? [...chain] : [];
  const normalizedSeen = new Set(Array.isArray(seen) ? seen : []);

  return {
    maxDepth,
    chain: normalizedChain,
    seen: normalizedSeen,
    idempotencyKey,
    scope,
    enter(identity) {
      const key = String(identity || "").trim();
      if (!key) throw new PlatformExecutionGuardError("Execution identity is required", { code: "EXECUTION_IDENTITY_REQUIRED", status: 400 });
      if (normalizedChain.includes(key)) {
        throw new PlatformExecutionGuardError(`Recursive execution detected for "${key}"`, {
          code: "EXECUTION_RECURSION_DETECTED",
          details: { chain: [...normalizedChain, key] },
        });
      }
      if (normalizedChain.length + 1 > maxDepth) {
        throw new PlatformExecutionGuardError("Maximum execution depth exceeded", {
          code: "EXECUTION_DEPTH_EXCEEDED",
          details: { maxDepth, chain: [...normalizedChain, key] },
        });
      }
      return createExecutionGuard({
        maxDepth,
        chain: [...normalizedChain, key],
        seen: [...normalizedSeen],
        idempotencyKey,
        scope,
      });
    },
    claim(identity) {
      const key = String(identity || "").trim();
      if (!key) throw new PlatformExecutionGuardError("Execution identity is required", { code: "EXECUTION_IDENTITY_REQUIRED", status: 400 });
      if (normalizedSeen.has(key)) {
        return { claimed: false, duplicate: true, identity: key };
      }
      normalizedSeen.add(key);
      return { claimed: true, duplicate: false, identity: key };
    },
    snapshot() {
      return {
        maxDepth,
        chain: [...normalizedChain],
        seen: [...normalizedSeen],
        idempotencyKey,
        scope,
      };
    },
  };
}

export async function claimPersistentExecution({
  db,
  companyId,
  scope,
  idempotencyKey,
  fingerprint = null,
  metadata = {},
  leaseSeconds = 300,
}) {
  if (!db || !companyId || !scope || !idempotencyKey) {
    throw new PlatformExecutionGuardError("Persistent execution claim requires db, company, scope and idempotency key", {
      code: "EXECUTION_CLAIM_INVALID",
      status: 400,
    });
  }
  const derivedFingerprint = fingerprint || executionFingerprint({ scope, idempotencyKey, metadata });
  const result = await db(
    `INSERT INTO platform_execution_claims(company_id,scope_key,idempotency_key,fingerprint,status,locked_until,metadata)
     VALUES($1,$2,$3,$4,'CLAIMED',NOW() + ($6 * INTERVAL '1 second'),$5::jsonb)
     ON CONFLICT(company_id,scope_key,idempotency_key) DO NOTHING
     RETURNING *`,
    [companyId, scope, idempotencyKey, derivedFingerprint, JSON.stringify(metadata || {}), Math.min(Math.max(Number(leaseSeconds) || 300, 30), 3600)]
  );
  if (result.rows?.[0]) return { claimed: true, duplicate: false, row: result.rows[0] };

  const existing = await db(
    `SELECT * FROM platform_execution_claims
      WHERE company_id=$1 AND scope_key=$2 AND idempotency_key=$3
      LIMIT 1`,
    [companyId, scope, idempotencyKey]
  );
  let row = existing.rows?.[0] || null;
  if (row && row.fingerprint && row.fingerprint !== derivedFingerprint) {
    throw new PlatformExecutionGuardError("Idempotency key was reused with different execution input", {
      code: "IDEMPOTENCY_KEY_REUSED",
      details: { scope, idempotencyKey },
    });
  }
  if (row?.status === "FAILED" || (row?.status === "CLAIMED" && row?.locked_until && new Date(row.locked_until).getTime() <= Date.now())) {
    const retry = await db(
      `UPDATE platform_execution_claims
          SET status='CLAIMED',result=NULL,error=NULL,locked_until=NOW() + ($2 * INTERVAL '1 second'),updated_at=NOW()
        WHERE id=$1 AND (status='FAILED' OR (status='CLAIMED' AND locked_until <= NOW()))
        RETURNING *`,
      [row.id, Math.min(Math.max(Number(leaseSeconds) || 300, 30), 3600)]
    );
    if (retry.rows?.[0]) {
      row = retry.rows[0];
      return { claimed: true, duplicate: false, retried: true, row };
    }
  }
  return { claimed: false, duplicate: true, row };
}

export async function completePersistentExecution({ db, claimId, status = "COMPLETED", result = null, error = null }) {
  if (!claimId) return;
  await db(
    `UPDATE platform_execution_claims
        SET status=$1,result=$2::jsonb,error=$3::jsonb,locked_until=NULL,updated_at=NOW()
      WHERE id=$4`,
    [status, JSON.stringify(result), JSON.stringify(error), claimId]
  );
}
