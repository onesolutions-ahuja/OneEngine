import { createShopifyAdapter } from "./shopifyAdapter.js";

function shopifyConnection(connection, credentials) {
  const shopDomain = String(credentials.shopDomain || credentials.shop_domain || connection.base_url || "")
    .replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return {
    shopDomain,
    apiVersion: credentials.apiVersion || credentials.api_version,
    accessToken: credentials.accessToken || credentials.access_token,
  };
}

function variantOptions(product) {
  if (!product?.variant_attributes || typeof product.variant_attributes !== "object") return [];
  return Object.entries(product.variant_attributes).map(([name, value]) => ({ name, value: String(value) }));
}

async function saveMapping(db, { integrationId, companyId, storeId, entityType, localEntityId, externalId, externalParentId = null, metadata = {} }) {
  await db(
    `INSERT INTO integration_entity_mappings
       (integration_id,company_id,store_id,entity_type,local_entity_id,external_id,external_parent_id,metadata,last_synced_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW(),NOW())
     ON CONFLICT (integration_id,entity_type,local_entity_id,external_parent_id)
     DO UPDATE SET external_id=EXCLUDED.external_id, metadata=EXCLUDED.metadata,
                   store_id=EXCLUDED.store_id, last_synced_at=NOW(), updated_at=NOW()` ,
    [integrationId, companyId, storeId, entityType, localEntityId, externalId, externalParentId, JSON.stringify(metadata)],
  );
}

function jsonValue(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function onlineOrderLineId(item) {
  return jsonValue(item.platform_data).lineItemId || null;
}

export async function exportShopifyRefund({ db, pool, companyId, storeId, connection, credentials, returnId, adapter = createShopifyAdapter() }) {
  const client = pool?.connect ? await pool.connect() : null;
  const query = client ? client.query.bind(client) : db;
  let transactionStarted = false;
  try {
    if (client) {
      await query("BEGIN");
      transactionStarted = true;
    }
    const returned = await query(
      `SELECT sr.id,sr.company_id,sr.store_id,sr.return_number,sr.refund_amount,sr.reason,
              o.id AS online_order_id,o.external_order_id,o.delivery_fee
         FROM stock_returns sr
         JOIN sales s ON s.id=sr.sale_id AND s.company_id=sr.company_id
         JOIN online_orders o ON o.id=s.online_order_id AND o.company_id=s.company_id AND o.platform='shopify'
        WHERE sr.id=$1 AND sr.company_id=$2 AND sr.return_type='CUSTOMER' AND sr.status='COMPLETED'
          AND ($3::uuid IS NULL OR sr.store_id=$3)
        LIMIT 1 ${client ? "FOR UPDATE OF sr" : ""}`,
      [returnId, companyId, storeId || null],
    );
    const record = returned.rows?.[0];
    if (!record) throw Object.assign(new Error("Canonical customer refund is not available to this company/store or is not a Shopify order"), { retryable: false });
    const prior = await query(
      `SELECT platform_response FROM online_order_events
        WHERE order_id=$1 AND event_type='SHOPIFY_REFUND_EXPORTED'
          AND platform_response->>'returnId'=$2 LIMIT 1`,
      [record.online_order_id, record.id],
    );
    if (prior.rows?.[0]) {
      if (transactionStarted) await query("COMMIT");
      transactionStarted = false;
      return { duplicate: true, orderId: record.online_order_id, refundId: prior.rows[0].platform_response?.refundId || null };
    }
    const amounts = await query("SELECT COALESCE(SUM(amount),0) AS amount FROM refunds WHERE return_id=$1", [record.id]);
    const amount = Number(amounts.rows?.[0]?.amount || record.refund_amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error("Canonical return has no refundable amount"), { retryable: false });
    const returnedLines = await query(
      `SELECT sri.product_id,sri.quantity,p.track_stock AS product_track_stock
         FROM stock_return_items sri
         JOIN products p ON p.id=sri.product_id AND p.company_id=$2
        WHERE sri.return_id=$1`,
      [record.id, companyId],
    );
    const orderLines = await query(
      `SELECT id,product_id,quantity,platform_data FROM online_order_items WHERE order_id=$1 ORDER BY created_at,id`,
      [record.online_order_id],
    );
    const remainingLines = (orderLines.rows || []).map((item) => ({
      id: onlineOrderLineId(item),
      productId: item.product_id,
      remaining: Number(item.quantity),
    }));
    const refundLineItems = [];
    for (const line of returnedLines.rows || []) {
      let remaining = Number(line.quantity);
      for (const candidate of remainingLines.filter((item) => String(item.productId) === String(line.product_id) && item.id && item.remaining > 0)) {
        const quantity = Math.min(remaining, candidate.remaining);
        if (quantity <= 0) continue;
        refundLineItems.push({ lineItemId: candidate.id, quantity, restock: line.product_track_stock === true });
        candidate.remaining -= quantity;
        remaining -= quantity;
        if (remaining <= 0) break;
      }
      if (remaining > 0) throw Object.assign(new Error("Canonical return line cannot be matched to a Shopify order line"), { retryable: false });
    }
    if (!refundLineItems.length) throw Object.assign(new Error("Canonical Shopify return has no mapped refund lines"), { retryable: false });
    const reference = `onePOS-return:${record.id}`;
    const refund = await adapter.createRefund({
      ...shopifyConnection(connection, credentials),
      orderId: record.external_order_id,
      amount,
      lineItems: refundLineItems,
      reference,
      note: record.return_number || `Return ${record.id}`,
    });
    await saveMapping(query, {
      integrationId: connection.id,
      companyId,
      storeId: record.store_id,
      entityType: "refund",
      localEntityId: record.id,
      externalId: refund.id,
      externalParentId: record.external_order_id,
      metadata: { amount, returnNumber: record.return_number || null },
    });
    await query(
      `INSERT INTO online_order_events (order_id,event_type,message,platform_response)
       VALUES ($1,'SHOPIFY_REFUND_EXPORTED',$2,$3::jsonb)`,
      [record.online_order_id, `Shopify refund ${refund.id} exported`, JSON.stringify({ returnId: record.id, refundId: refund.id, amount })],
    );
    await query("UPDATE integration_connections SET last_error=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [connection.id, companyId]);
    if (transactionStarted) await query("COMMIT");
    transactionStarted = false;
    return { duplicate: refund.duplicate === true, returnId: record.id, orderId: record.online_order_id, refundId: refund.id, amount };
  } catch (error) {
    if (transactionStarted) await query("ROLLBACK").catch(() => {});
    transactionStarted = false;
    await db("UPDATE integration_connections SET last_error=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [String(error?.message || "Shopify refund export failed").slice(0, 500), connection.id, companyId]).catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

export async function exportShopifyFulfillment({ db, pool, companyId, storeId, connection, credentials, orderId, adapter = createShopifyAdapter(), notifyCustomer = true }) {
  const client = pool?.connect ? await pool.connect() : null;
  const query = client ? client.query.bind(client) : db;
  let transactionStarted = false;

  try {
    if (client) {
      await query("BEGIN");
      transactionStarted = true;
    }

    const orderResult = await query(
      `SELECT id,external_order_id,status,store_id
         FROM online_orders
        WHERE id=$1 AND company_id=$2 AND platform='shopify'
          AND ($3::uuid IS NULL OR store_id=$3) LIMIT 1 ${client ? "FOR UPDATE" : ""}`,
      [orderId, companyId, storeId || null],
    );

    const order = orderResult.rows?.[0];
    if (!order) throw new Error("Shopify order is not available to this company or store");
    if (!["COMPLETED", "COLLECTED"].includes(order.status)) throw new Error("Shopify fulfilment requires a completed onePOS order");

    const prior = await query(
      `SELECT platform_response FROM online_order_events
        WHERE order_id=$1 AND event_type='SHOPIFY_FULFILMENT_EXPORTED' LIMIT 1`,
      [order.id],
    );

    if (prior.rows?.[0]) {
      if (transactionStarted) await query("COMMIT");
      transactionStarted = false;
      return { duplicate: true, orderId: order.id, fulfillmentId: prior.rows[0].platform_response?.fulfillmentId || null };
    }

    const items = await query(
      `SELECT id,quantity,platform_data FROM online_order_items WHERE order_id=$1 ORDER BY created_at`,
      [order.id],
    );

    const lineItems = (items.rows || []).map((item) => {
      let platformData = item.platform_data;
      if (typeof platformData === "string") {
        try {
          platformData = JSON.parse(platformData);
        } catch {
          platformData = {};
        }
      }
      return { lineItemId: platformData?.lineItemId, quantity: Number(item.quantity) };
    }).filter((item) => item.lineItemId && item.quantity > 0);

    if (!lineItems.length) throw new Error("Shopify order has no mapped fulfilment lines");

    const fulfillment = await adapter.createFulfillment({
      ...shopifyConnection(connection, credentials),
      orderId: order.external_order_id,
      lineItems,
      notifyCustomer,
    });

    await saveMapping(query, {
      integrationId: connection.id,
      companyId,
      storeId: order.store_id || storeId,
      entityType: "fulfilment",
      localEntityId: order.id,
      externalId: fulfillment.id,
      externalParentId: order.external_order_id,
      metadata: { status: fulfillment.status || null },
    });

    await query(
      `INSERT INTO online_order_events (order_id,event_type,message,platform_response)
       VALUES ($1,'SHOPIFY_FULFILMENT_EXPORTED',$2,$3::jsonb)`,
      [order.id, `Shopify fulfilment ${fulfillment.id} exported`, JSON.stringify({ fulfillmentId: fulfillment.id, orderId: order.external_order_id })],
    );

    await query("UPDATE integration_connections SET last_error=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2", [connection.id, companyId]);
    if (transactionStarted) await query("COMMIT");
    transactionStarted = false;

    return { duplicate: false, orderId: order.id, fulfillmentId: fulfillment.id, status: fulfillment.status || null };
  } catch (error) {
    if (transactionStarted) await query("ROLLBACK").catch(() => {});
    transactionStarted = false;
    await db("UPDATE integration_connections SET last_error=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [String(error?.message || "Shopify fulfilment failed").slice(0, 500), connection.id, companyId]).catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
}

export async function syncShopifyProducts({ db, companyId, storeId, connection, credentials, adapter = createShopifyAdapter() }) {
  const priceListId = credentials.priceListId || credentials.price_list_id || null;
  const products = await db(
    `SELECT p.id,p.parent_product_id,p.product_kind,p.variant_attributes,p.name,p.description,p.sku,p.barcode,p.price,p.active,
            m.external_id AS shopify_product_id,
            COALESCE(plp.price,p.price) AS outbound_price
       FROM products p
       LEFT JOIN integration_entity_mappings m
         ON m.integration_id=$2 AND m.company_id=p.company_id AND m.entity_type='product' AND m.local_entity_id=p.id
       LEFT JOIN price_list_prices plp
         ON plp.product_id=p.id AND plp.price_list_id=$3
        AND EXISTS (SELECT 1 FROM price_lists pl WHERE pl.id=plp.price_list_id AND pl.company_id=p.company_id AND pl.active=true)
      WHERE p.company_id=$1 AND p.active=true AND (p.parent_product_id IS NULL OR p.product_kind <> 'variant')
      ORDER BY p.created_at ASC`,
    [companyId, connection.id, priceListId],
  );
  const result = [];
  for (const product of products.rows || []) {
    const variants = await db(
      `SELECT p.id,p.variant_attributes,p.name,p.sku,p.barcode,p.price,p.active,m.external_id AS shopify_variant_id,
              COALESCE(plp.price,p.price) AS outbound_price,
              m.metadata->>'inventoryItemId' AS inventory_item_id
         FROM products p
         LEFT JOIN integration_entity_mappings m
           ON m.integration_id=$2 AND m.company_id=p.company_id AND m.entity_type='product_variant' AND m.local_entity_id=p.id
        LEFT JOIN price_list_prices plp
          ON plp.product_id=p.id AND plp.price_list_id=$4
         AND EXISTS (SELECT 1 FROM price_lists pl WHERE pl.id=plp.price_list_id AND pl.company_id=p.company_id AND pl.active=true)
        WHERE p.company_id=$1 AND (p.id=$3 OR p.parent_product_id=$3) AND p.active=true
        ORDER BY p.created_at ASC`,
      [companyId, connection.id, product.id, priceListId],
    );
    const response = await adapter.upsertProduct({
      ...shopifyConnection(connection, credentials),
      product: {
        ...product,
        title: product.name,
        price: product.outbound_price ?? product.price,
        externalId: product.shopify_product_id,
        variants: (variants.rows || []).map((variant) => ({
          ...variant,
          price: variant.outbound_price ?? variant.price,
          externalId: variant.shopify_variant_id,
          inventoryItemId: variant.inventory_item_id,
          options: variantOptions(variant),
        })),
      },
    });
    await saveMapping(db, {
      integrationId: connection.id, companyId, storeId, entityType: "product",
      localEntityId: product.id, externalId: response.id, metadata: { status: response.status },
    });
    for (const remoteVariant of response.variants?.nodes || []) {
      const localVariant = (variants.rows || []).find((item) =>
        (item.sku && item.sku === remoteVariant.sku) || (item.barcode && item.barcode === remoteVariant.barcode));
      if (!localVariant) continue;
      await saveMapping(db, {
        integrationId: connection.id, companyId, storeId, entityType: "product_variant",
        localEntityId: localVariant.id, externalId: remoteVariant.id, externalParentId: response.id,
        metadata: { inventoryItemId: remoteVariant.inventoryItem?.id || null, sku: remoteVariant.sku || null },
      });
    }
    result.push({ productId: product.id, shopifyProductId: response.id, variantCount: response.variants?.nodes?.length || 0 });
  }
  return { synced: result.length, products: result };
}

export async function syncShopifyInventory({ db, companyId, storeId, connection, credentials, adapter = createShopifyAdapter() }) {
  const mappings = Array.isArray(credentials.storeLocationMappings)
    ? credentials.storeLocationMappings
    : Array.isArray(credentials.store_location_mappings) ? credentials.store_location_mappings : [];
  const locationId = mappings.find((item) => String(item.storeId || item.store_id) === String(storeId))?.shopifyLocationId
    || mappings.find((item) => String(item.storeId || item.store_id) === String(storeId))?.shopify_location_id;
  if (!locationId) throw new Error("Shopify inventory sync requires a Shopify location mapped to this store");
  const rows = await db(
    `SELECT s.product_id,s.quantity,m.external_id,m.metadata->>'inventoryItemId' AS inventory_item_id
       FROM product_store_stock s
       JOIN integration_entity_mappings m
         ON m.integration_id=$3 AND m.company_id=s.company_id AND m.local_entity_id=s.product_id
        AND m.entity_type='product_variant'
      WHERE s.company_id=$1 AND s.store_id=$2 AND s.quantity IS NOT NULL`,
    [companyId, storeId, connection.id],
  );
  const synced = [];
  for (const row of rows.rows || []) {
    if (!row.inventory_item_id) continue;
    await adapter.updateInventoryLevel({
      ...shopifyConnection(connection, credentials),
      inventoryItemId: row.inventory_item_id,
      locationId,
      quantity: Number(row.quantity),
    });
    synced.push({ productId: row.product_id, inventoryItemId: row.inventory_item_id, quantity: Number(row.quantity) });
  }
  return { synced: synced.length, skipped: (rows.rows || []).filter((row) => !row.inventory_item_id).length, inventory: synced };
}
