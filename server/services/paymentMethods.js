// Canonical payment-method registry backed by company metadata records.
// Consumers must resolve methods here instead of maintaining local tender lists.
export const DEFAULT_PAYMENT_METHODS = Object.freeze([]);

export async function listPaymentMethods(db, companyId, { activeOnly = true } = {}) {
  if (!db || !companyId) return [];
  try {
    const result = await db(
      `SELECT id, code, label, kind, active, allow_offline, sort_order, config
       FROM payment_methods
       WHERE company_id=$1 ${activeOnly ? "AND active=true" : ""}
       ORDER BY sort_order, label`,
      [companyId]
    );
    if (result.rows.length) return result.rows.map((row) => {
      const config = row.config || {};
      return {
        id: row.id, code: row.code, label: row.label, kind: row.kind, active: row.active,
        allowOffline: row.allow_offline,
        requiresConnector: config.requiresConnector === true || Boolean(config.connectorPackageKey) || String(row.kind || "").toUpperCase() === "CARD",
        sortOrder: row.sort_order,
        config,
        system: false,
      };
    });
  } catch (error) {
    // Backward-compatible during rolling deployments before the migration runs.
    if (error?.code !== "42P01") throw error;
  }
  return [];
}

export async function getAllowedPaymentMethodCodes(db, companyId, scope = {}) {
  await ensureConnectorPaymentMethods(db, companyId, scope);
  return (await listPaymentMethods(db, companyId)).map((item) => item.code);
}

export async function ensureConnectorPaymentMethods(){ return []; }

export async function ensureDefaultPaymentMethods(){ return []; }
