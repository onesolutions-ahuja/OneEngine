// Canonical payment-method registry backed by company metadata records.
// Consumers must resolve methods here instead of maintaining local tender lists.
export const DEFAULT_PAYMENT_METHODS = Object.freeze([
  { code: "cash", label: "Cash", kind: "CASH", allowOffline: true, requiresConnector: false, sortOrder: 10,
    config: { requiresCashReceived: true, offlineQueue: true, showChange: true, inputFields: [{ key: "cashReceivedOverride", label: "Cash received", type: "currency", required: true }] } },
  { code: "card", label: "Card", kind: "CARD", allowOffline: false, requiresConnector: true, sortOrder: 20,
    config: { requiresConnector: true, inputFields: [] } },
  { code: "customer_credit", label: "Customer Credit", kind: "CREDIT", allowOffline: false, sortOrder: 30,
    config: { requiresCustomer: true, inputFields: [] } },
  { code: "gift_card", label: "Gift Card", kind: "GIFT_CARD", allowOffline: false, sortOrder: 40,
    config: { handler: "gift_card", requiresGiftCardCode: true, inputFields: [{ key: "giftCardCode", label: "Gift card code", type: "text", required: true }] } },
  { code: "voucher", label: "Voucher", kind: "VOUCHER", allowOffline: false, sortOrder: 50, config: { inputFields: [] } },
  { code: "cheque", label: "Cheque", kind: "CHEQUE", allowOffline: false, sortOrder: 60, config: { inputFields: [] } },
  { code: "bank_transfer", label: "Bank Transfer", kind: "BANK_TRANSFER", allowOffline: false, sortOrder: 70, config: { inputFields: [] } },
  { code: "online", label: "Online", kind: "ONLINE", allowOffline: false, sortOrder: 80, config: { inputFields: [] } },
]);

export async function listPaymentMethods(db, companyId, { activeOnly = true } = {}) {
  if (!db || !companyId) return DEFAULT_PAYMENT_METHODS.map((item) => ({ ...item, config: { ...(item.config || {}) }, active: true, system: true }));
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
  return DEFAULT_PAYMENT_METHODS.map((item) => ({ ...item, config: { ...(item.config || {}) }, active: true, system: true, requiresConnector: item.requiresConnector === true }));
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

export async function ensureDefaultPaymentMethods(db, companyId) {
  if (!db || !companyId) return;
  for (const method of DEFAULT_PAYMENT_METHODS) {
    await db(
      `INSERT INTO payment_methods (company_id,code,label,kind,active,allow_offline,sort_order,config)
       VALUES ($1,$2,$3,$4,true,$5,$6,$7::jsonb)
       ON CONFLICT (company_id,code) DO UPDATE SET
         label=EXCLUDED.label,
         kind=EXCLUDED.kind,
         allow_offline=EXCLUDED.allow_offline,
         sort_order=EXCLUDED.sort_order,
         config=CASE WHEN payment_methods.config='{}'::jsonb THEN EXCLUDED.config ELSE payment_methods.config END,
         updated_at=NOW()`,
      [companyId, method.code, method.label, method.kind, method.allowOffline, method.sortOrder, JSON.stringify(method.config || {})]
    );
  }
}
