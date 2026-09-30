import { randomUUID } from "node:crypto";

function normalizeName(name) {
  const value = String(name || "sp").replace(/[^a-zA-Z0-9_]/g, "_");
  return value || "sp";
}

export class PlatformTransactionError extends Error {
  constructor(message, { code = "PLATFORM_TRANSACTION_FAILED", phase = null, cause = null, transactionId = null } = {}) {
    super(message);
    this.name = "PlatformTransactionError";
    this.code = code;
    this.phase = phase;
    this.cause = cause;
    this.transactionId = transactionId;
  }
}

export async function withPlatformTransaction({
  pool,
  transactionId = randomUUID(),
  isolation = null,
  readOnly = false,
  handler,
}) {
  if (!pool?.connect || typeof handler !== "function") {
    throw new Error("Platform transaction requires a pool and handler");
  }

  const client = await pool.connect();
  const afterCommitCallbacks = [];
  let committed = false;
  let rolledBack = false;

  const tx = {
    id: transactionId,
    client,
    query: client.query.bind(client),
    afterCommit(callback) {
      if (typeof callback !== "function") throw new Error("afterCommit callback must be a function");
      afterCommitCallbacks.push(callback);
    },
    async savepoint(name, handlerFn) {
      if (typeof handlerFn !== "function") throw new Error("Savepoint handler must be a function");
      const savepoint = normalizeName(name);
      await client.query(`SAVEPOINT "${savepoint}"`);
      try {
        const result = await handlerFn(tx);
        await client.query(`RELEASE SAVEPOINT "${savepoint}"`);
        return result;
      } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT "${savepoint}"`);
        await client.query(`RELEASE SAVEPOINT "${savepoint}"`);
        throw error;
      }
    },
    get committed() { return committed; },
    get rolledBack() { return rolledBack; },
  };

  try {
    await client.query("BEGIN");
    if (isolation) {
      const level = String(isolation).toUpperCase();
      const allowed = new Set(["READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"]);
      if (!allowed.has(level)) throw new Error("Unsupported transaction isolation level");
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${level}`);
    }
    if (readOnly) await client.query("SET TRANSACTION READ ONLY");

    const result = await handler(tx);

    try {
      await client.query("COMMIT");
      committed = true;
    } catch (error) {
      throw new PlatformTransactionError("Transaction commit failed", {
        code: "TRANSACTION_COMMIT_FAILED",
        phase: "COMMIT",
        cause: error,
        transactionId,
      });
    }

    const callbackResults = [];
    for (const callback of afterCommitCallbacks) {
      try {
        callbackResults.push({ status: "COMPLETED", result: await callback() });
      } catch (error) {
        callbackResults.push({
          status: "FAILED",
          error: {
            message: String(error?.message || error).slice(0, 2000),
            code: error?.code || null,
          },
        });
      }
    }

    return {
      result,
      transactionId,
      committed: true,
      afterCommit: callbackResults,
    };
  } catch (error) {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
        rolledBack = true;
      } catch {}
    }
    if (error instanceof PlatformTransactionError) throw error;
    throw new PlatformTransactionError(error?.message || "Transaction failed", {
      code: error?.code || "PLATFORM_TRANSACTION_FAILED",
      phase: committed ? "AFTER_COMMIT" : "TRANSACTION",
      cause: error,
      transactionId,
    });
  } finally {
    client.release();
  }
}
