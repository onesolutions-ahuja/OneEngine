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

export async function ensureConnectorPaymentMethods(db, companyId, { storeId = null, tillId = null } = {}) {
  if (!db || !companyId) return;
  try {
    const result = await db(
      `SELECT c.connector_package_key, c.connector_configuration, p.manifest
        FROM integration_connections c
        LEFT JOIN package_registry p ON p.package_key=c.connector_package_key
        WHERE c.company_id=$1 AND c.enabled=true
         AND (c.store_id IS NULL OR c.store_id=$2)
         AND (c.till_id IS NULL OR c.till_id=$3)`,
      [companyId, storeId, tillId]
    );
    for (const row of result.rows || []) {
      let configuration = row.connector_configuration || {};
      if (typeof configuration === "string") { try { configuration = JSON.parse(configuration); } catch { configuration = {}; } }
      let manifest = row.manifest || {};
      if (typeof manifest === "string") { try { manifest = JSON.parse(manifest); } catch { manifest = {}; } }
      const app = manifest.connectorApp || {};
      const code = String(configuration.paymentMethodCode || app.paymentMethodCode || "").trim();
      if (!code) continue;
      await db(
        `INSERT INTO payment_methods(company_id,code,label,kind,active,allow_offline,sort_order,config)
         VALUES($1,$2,$3,$4,true,false,85,$5::jsonb)
         ON CONFLICT(company_id,code) DO UPDATE SET active=true, config=EXCLUDED.config, updated_at=NOW()`,
        [companyId, code, configuration.paymentMethodLabel || app.paymentMethodLabel || code, configuration.paymentMethodKind || app.paymentMethodKind || "ONLINE", JSON.stringify({ connectorPackageKey: row.connector_package_key })]
      );
    }
  } catch (error) {
    if (error?.code !== "42P01") throw error;
  }
}

export async function ensureDefaultPaymentMethods() {
  // Payment methods are metadata-owned; no business defaults are seeded in code.
}
