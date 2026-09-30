import { createQuickBooksAdapter } from "./quickbooksAdapter.js";

function jsonValue(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function mappingConfig(credentials = {}) {
  const raw = credentials.accountMappings || credentials.account_mappings || credentials.mappings || {};
  return {
    ...raw,
    taxCodeId: raw.taxCodeId || raw.vatCodeId || raw.tax_code_id || raw.vat_code,
    accountsPayableAccountId: raw.accountsPayableAccountId || raw.apAccountId || raw.accounts_payable_account,
    inventoryAssetAccountId: raw.inventoryAssetAccountId || raw.inventory_asset_account,
    expenseAccountId: raw.expenseAccountId || raw.purchaseAccountId || raw.expense_account,
    purchaseAccountId: raw.purchaseAccountId || raw.purchase_account,
    paymentAccountId: raw.paymentAccountId || raw.bankAccountId || raw.payment_account,
    bankAccountId: raw.bankAccountId || raw.bank_account,
  };
}

async function findMapping(db, { integrationId, companyId, entityType, localEntityId }) {
  const result = await db(
    `SELECT id, external_id, metadata, mapping_status
       FROM integration_entity_mappings
      WHERE integration_id=$1 AND company_id=$2 AND entity_type=$3 AND local_entity_id=$4
      ORDER BY updated_at DESC LIMIT 1`,
    [integrationId, companyId, entityType, localEntityId],
  );
  return result.rows?.[0] || null;
}

async function saveMapping(db, { integrationId, companyId, storeId = null, entityType, localEntityId, externalId, metadata = {} }) {
  await db(
    `INSERT INTO integration_entity_mappings
       (integration_id,company_id,store_id,entity_type,local_entity_id,external_id,mapping_status,metadata,last_synced_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'LINKED',$7::jsonb,NOW(),NOW())
     ON CONFLICT (integration_id,entity_type,local_entity_id,external_parent_id)
     DO UPDATE SET external_id=EXCLUDED.external_id, mapping_status='LINKED', metadata=EXCLUDED.metadata,
                   safe_error=NULL, store_id=EXCLUDED.store_id, last_synced_at=NOW(), updated_at=NOW()` ,
    [integrationId, companyId, storeId, entityType, localEntityId, String(externalId), JSON.stringify(metadata)],
  );
}

async function saveError(db, { integrationId, companyId, entityType, localEntityId, message }) {
  await db(
    `UPDATE integration_entity_mappings
        SET mapping_status='ERROR', safe_error=$1, updated_at=NOW()
      WHERE integration_id=$2 AND company_id=$3 AND entity_type=$4 AND local_entity_id=$5`,
    [String(message || "QuickBooks sync failed").slice(0, 500), integrationId, companyId, entityType, localEntityId],
  ).catch(() => {});
  await db(
    `UPDATE integration_connections SET last_error=$1, updated_at=NOW()
      WHERE id=$2 AND company_id=$3`,
    [String(message || "QuickBooks sync failed").slice(0, 500), integrationId, companyId],
  ).catch(() => {});
}

function adapterConnection(connection, credentials) {
  return {
    companyId: credentials.realmId || credentials.realm_id || connection.company_id,
    realmId: credentials.realmId || credentials.realm_id,
    environment: credentials.environment,
    accessToken: credentials.accessToken || credentials.access_token,
  };
}

function externalId(entity) {
  return entity?.Id || entity?.id || null;
}

function syncToken(entity) {
  return entity?.SyncToken || entity?.syncToken || null;
}

function mappingId(mapping) {
  return mapping?.external_id || null;
}

function supplierPayload(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    contactName: row.contact_name,
    active: row.active,
  };
}

export async function syncQuickBooksVendor({ db, companyId, connection, credentials, supplierId, adapter = createQuickBooksAdapter() }) {
  if (!supplierId) throw new Error("Supplier ID is required");
  const supplierResult = await db(
    `SELECT id, company_id, name, contact_name, email, phone, address, active
       FROM suppliers WHERE id=$1 AND company_id=$2`,
    [supplierId, companyId],
  );
  const supplier = supplierResult.rows?.[0];
  if (!supplier) throw new Error("Supplier not found");
  const existing = await findMapping(db, { integrationId: connection.id, companyId, entityType: "supplier", localEntityId: supplier.id });
  try {
    const result = await adapter.syncVendor({
      connection: adapterConnection(connection, credentials),
      supplier: supplierPayload(supplier),
      externalId: mappingId(existing),
      syncToken: jsonValue(existing?.metadata).syncToken || null,
      sourceId: supplier.id,
    });
    const id = externalId(result);
    if (!id) throw new Error("QuickBooks vendor response did not include an ID");
    await saveMapping(db, {
      integrationId: connection.id,
      companyId,
      entityType: "supplier",
      localEntityId: supplier.id,
      externalId: id,
      metadata: { syncToken: syncToken(result), displayName: result.DisplayName || supplier.name },
    });
    return { supplierId: supplier.id, externalId: id, updated: Boolean(existing) };
  } catch (error) {
    await saveError(db, { integrationId: connection.id, companyId, entityType: "supplier", localEntityId: supplier.id, message: error.message });
    throw error;
  }
}

async function loadPurchase(db, { companyId, purchaseId = null, invoiceId = null }) {
  const result = invoiceId
    ? await db(
        `SELECT si.id AS invoice_id, si.invoice_number, si.invoice_date, si.due_date, si.subtotal AS invoice_subtotal,
                si.tax AS invoice_tax, si.total AS invoice_total, si.supplier_id, si.purchase_id,
                p.id, p.company_id, p.store_id, p.reference_number, p.purchase_date, p.status, p.subtotal, p.total,
                s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone, s.address AS supplier_address,
                s.contact_name AS supplier_contact_name
           FROM supplier_invoices si
           JOIN suppliers s ON s.id=si.supplier_id AND s.company_id=si.company_id
           LEFT JOIN purchases p ON p.id=si.purchase_id AND p.company_id=si.company_id
          WHERE si.id=$1 AND si.company_id=$2`,
        [invoiceId, companyId],
      )
    : await db(
        `SELECT p.id, p.company_id, p.store_id, p.supplier_id, p.reference_number, p.purchase_date, p.status, p.subtotal, p.total,
                s.name AS supplier_name, s.email AS supplier_email, s.phone AS supplier_phone, s.address AS supplier_address,
                s.contact_name AS supplier_contact_name
           FROM purchases p
           LEFT JOIN suppliers s ON s.id=p.supplier_id AND s.company_id=p.company_id
          WHERE p.id=$1 AND p.company_id=$2`,
        [purchaseId, companyId],
      );
  const row = result.rows?.[0];
  if (!row) throw new Error(invoiceId ? "Supplier invoice not found" : "Purchase not found");
  const lines = row.id
    ? await db(
        `SELECT pi.id, pi.product_id, pi.quantity, pi.unit_cost, pi.line_total,
                pr.name AS product_name, pr.sku, pr.barcode
           FROM purchase_items pi JOIN products pr ON pr.id=pi.product_id
          WHERE pi.purchase_id=$1 ORDER BY pi.id`,
        [row.id],
      )
    : { rows: [] };
  return { ...row, items: lines.rows || [] };
}

async function purchaseLines(db, { connection, companyId, items, accountMappings }) {
  const mapped = [];
  let allHaveItems = true;
  for (const item of items) {
    const itemMapping = await findMapping(db, { integrationId: connection.id, companyId, entityType: "product", localEntityId: item.product_id });
    const itemId = mappingId(itemMapping);
    if (!itemId) allHaveItems = false;
    mapped.push({
      itemId,
      accountId: accountMappings.expenseAccountId || accountMappings.purchaseAccountId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_cost),
      amount: Number(item.line_total || Number(item.quantity) * Number(item.unit_cost)),
      description: item.product_name || item.sku || item.product_id,
      taxCodeId: accountMappings.taxCodeId || accountMappings.vatCodeId,
    });
  }
  return { lines: mapped, useExpenseLines: !allHaveItems };
}

export async function exportQuickBooksPurchase({ db, companyId, connection, credentials, purchaseId = null, invoiceId = null, adapter = createQuickBooksAdapter() }) {
  const entityId = invoiceId || purchaseId;
  if (!entityId) throw new Error("Purchase or supplier invoice ID is required");
  const entityType = invoiceId ? "supplier_invoice" : "purchase";
  const existing = await findMapping(db, { integrationId: connection.id, companyId, entityType, localEntityId: entityId });
  if (existing?.mapping_status === "LINKED" && existing.external_id) {
    return { entityType, entityId, externalId: existing.external_id, alreadySynced: true, updated: false };
  }
  try {
    const purchase = await loadPurchase(db, { companyId, purchaseId, invoiceId });
    if (!purchase.supplier_id) throw new Error("Purchase has no supplier");
    const vendor = await syncQuickBooksVendor({ db, companyId, connection, credentials, supplierId: purchase.supplier_id, adapter });
    const accountMappings = mappingConfig(credentials);
    const lineResult = await purchaseLines(db, { connection, companyId, items: purchase.items, accountMappings });
    const result = await adapter.exportPurchase({
      connection: adapterConnection(connection, credentials),
      vendorId: vendor.externalId,
      lines: lineResult.lines,
      transactionDate: purchase.invoice_date || purchase.purchase_date,
      dueDate: purchase.due_date,
      reference: purchase.invoice_number || purchase.reference_number,
      mappings: { ...accountMappings, useExpenseLines: lineResult.useExpenseLines },
      sourceId: entityId,
    });
    const id = externalId(result);
    if (!id) throw new Error("QuickBooks purchase response did not include an ID");
    await saveMapping(db, {
      integrationId: connection.id,
      companyId,
      storeId: purchase.store_id,
      entityType,
      localEntityId: entityId,
      externalId: id,
      metadata: { syncToken: syncToken(result), vendorId: vendor.externalId, invoiceNumber: purchase.invoice_number || null },
    });
    return { entityType, entityId, externalId: id, vendorExternalId: vendor.externalId, updated: Boolean(existing) };
  } catch (error) {
    await saveError(db, { integrationId: connection.id, companyId, entityType, localEntityId: entityId, message: error.message });
    throw error;
  }
}

export async function exportQuickBooksSupplierPayment({ db, companyId, connection, credentials, paymentId, adapter = createQuickBooksAdapter() }) {
  if (!paymentId) throw new Error("Supplier payment ID is required");
  const entityType = "supplier_payment";
  const existing = await findMapping(db, { integrationId: connection.id, companyId, entityType, localEntityId: paymentId });
  if (existing?.mapping_status === "LINKED" && existing.external_id) {
    return { entityType, entityId: paymentId, externalId: existing.external_id, alreadySynced: true, updated: false };
  }
  try {
    const paymentResult = await db(
      `SELECT sp.*, s.name AS supplier_name FROM supplier_payments sp
        JOIN suppliers s ON s.id=sp.supplier_id AND s.company_id=sp.company_id
       WHERE sp.id=$1 AND sp.company_id=$2 AND sp.status <> 'CANCELLED'`,
      [paymentId, companyId],
    );
    const payment = paymentResult.rows?.[0];
    if (!payment) throw new Error("Supplier payment not found");
    const vendor = await syncQuickBooksVendor({ db, companyId, connection, credentials, supplierId: payment.supplier_id, adapter });
    const allocationResult = await db(
      `SELECT a.amount, m.external_id AS invoice_external_id
         FROM supplier_payment_allocations a
         JOIN supplier_invoices i ON i.id=a.invoice_id AND i.company_id=$2
         LEFT JOIN integration_entity_mappings m ON m.integration_id=$1 AND m.company_id=$2
           AND m.entity_type='supplier_invoice' AND m.local_entity_id=i.id
        WHERE a.payment_id=$3`,
      [connection.id, companyId, paymentId],
    );
    const allocations = (allocationResult.rows || []).map((row) => ({ amount: Number(row.amount), externalId: row.invoice_external_id })).filter((row) => row.externalId);
    const result = await adapter.exportSupplierPayment({
      connection: adapterConnection(connection, credentials),
      vendorId: vendor.externalId,
      amount: payment.amount,
      paymentDate: payment.payment_date,
      paymentAccountId: mappingConfig(credentials).paymentAccountId || mappingConfig(credentials).bankAccountId,
      allocations,
      reference: payment.reference,
      sourceId: payment.id,
    });
    const id = externalId(result);
    if (!id) throw new Error("QuickBooks supplier payment response did not include an ID");
    await saveMapping(db, { integrationId: connection.id, companyId, storeId: payment.store_id, entityType, localEntityId: payment.id, externalId: id, metadata: { syncToken: syncToken(result), vendorId: vendor.externalId, allocations } });
    return { entityType, entityId: payment.id, externalId: id, vendorExternalId: vendor.externalId, allocationCount: allocations.length, updated: Boolean(existing) };
  } catch (error) {
    await saveError(db, { integrationId: connection.id, companyId, entityType, localEntityId: paymentId, message: error.message });
    throw error;
  }
}

export async function exportQuickBooksSupplierCredit({ db, companyId, connection, credentials, returnId, adapter = createQuickBooksAdapter() }) {
  if (!returnId) throw new Error("Supplier return ID is required");
  const entityType = "supplier_return";
  const existing = await findMapping(db, { integrationId: connection.id, companyId, entityType, localEntityId: returnId });
  if (existing?.mapping_status === "LINKED" && existing.external_id) {
    return { entityType, entityId: returnId, externalId: existing.external_id, alreadySynced: true, updated: false };
  }
  try {
    const returnResult = await db(
      `SELECT sr.id, sr.company_id, sr.store_id, sr.return_number, sr.purchase_id, sr.supplier_id, sr.refund_amount, sr.created_at,
              s.name AS supplier_name
         FROM stock_returns sr JOIN suppliers s ON s.id=sr.supplier_id AND s.company_id=sr.company_id
        WHERE sr.id=$1 AND sr.company_id=$2 AND sr.return_type='SUPPLIER' AND sr.status='COMPLETED'`,
      [returnId, companyId],
    );
    const returnRow = returnResult.rows?.[0];
    if (!returnRow) throw new Error("Supplier return not found");
    const vendor = await syncQuickBooksVendor({ db, companyId, connection, credentials, supplierId: returnRow.supplier_id, adapter });
    const itemsResult = await db(
      `SELECT sri.quantity, pi.unit_cost, pr.name AS product_name, pi.product_id
         FROM stock_return_items sri
         LEFT JOIN purchase_items pi ON pi.id=sri.purchase_item_id
         JOIN products pr ON pr.id=sri.product_id
        WHERE sri.return_id=$1`,
      [returnId],
    );
    const accountMappings = mappingConfig(credentials);
    const lines = (itemsResult.rows || []).map((item) => ({
      itemId: null,
      accountId: accountMappings.expenseAccountId || accountMappings.purchaseAccountId,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_cost || 0),
      amount: Number(item.quantity) * Number(item.unit_cost || 0),
      description: item.product_name,
      taxCodeId: accountMappings.taxCodeId || accountMappings.vatCodeId,
    }));
    const result = await adapter.exportVendorCredit({ connection: adapterConnection(connection, credentials), vendorId: vendor.externalId, lines, transactionDate: returnRow.created_at, reference: returnRow.return_number, mappings: { ...accountMappings, useExpenseLines: true }, sourceId: returnId });
    const id = externalId(result);
    if (!id) throw new Error("QuickBooks vendor credit response did not include an ID");
    await saveMapping(db, { integrationId: connection.id, companyId, storeId: returnRow.store_id, entityType, localEntityId: returnId, externalId: id, metadata: { syncToken: syncToken(result), vendorId: vendor.externalId } });
    return { entityType, entityId: returnId, externalId: id, vendorExternalId: vendor.externalId, updated: Boolean(existing) };
  } catch (error) {
    await saveError(db, { integrationId: connection.id, companyId, entityType, localEntityId: returnId, message: error.message });
    throw error;
  }
}
