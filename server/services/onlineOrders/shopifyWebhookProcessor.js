import { syncBatchMovement } from "../inventory.js";
import { transitionGenericOrder } from "./genericOrderService.js";

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function money(value, name, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Shopify ${name} is invalid`);
  return round2(amount);
}

function text(value, max = 500) {
  return value == null ? null : String(value).trim().slice(0, max) || null;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try { return JSON.parse(value); } catch { return {}; }
}

function numericShopifyId(value, resource) {
  const id = String(value || "").trim();
  if (!id) return null;
  const prefix = `gid://shopify/${resource}/`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function mappedShopifyLineId(item) {
  const platformData = parseJson(item.platform_data);
  return numericShopifyId(platformData.lineItemId || platformData.lineItemNumericId || item.external_item_id, "LineItem");
}

function shopifyLocationMappings(credentials) {
  return Array.isArray(credentials.storeLocationMappings)
    ? credentials.storeLocationMappings
    : Array.isArray(credentials.store_location_mappings) ? credentials.store_location_mappings : [];
}

async function processShopifyProductEvent({ db, companyId, connection, topic, payload, eventId, deliveryId }) {
  const productId = numericShopifyId(payload?.admin_graphql_api_id || payload?.id, "Product");
  if (!productId) throw Object.assign(new Error("Shopify product event has no product ID"), { retryable: false });
  const gid = `gid://shopify/Product/${productId}`;
  const deleted = topic === "products/delete";
  const mappings = await db(
    `SELECT id,entity_type,local_entity_id,external_id,external_parent_id,metadata
       FROM integration_entity_mappings
      WHERE integration_id=$1 AND company_id=$2
        AND ((entity_type='product' AND external_id=ANY($3::text[]))
          OR (entity_type='product_variant' AND external_parent_id=ANY($3::text[])))`,
    [connection.id, companyId, [productId, gid]],
  );
  if (!(mappings.rows || []).length) return { ignored: true, reason: "UNMAPPED_SHOPIFY_PRODUCT", productId };
  const snapshot = {
    title: text(payload.title, 255),
    status: text(payload.status, 40),
    handle: text(payload.handle, 255),
    updatedAt: text(payload.updated_at, 80),
    deleted,
    eventId: text(eventId, 200),
    deliveryId: text(deliveryId, 200),
    receivedAt: new Date().toISOString(),
  };
  await db(
    `UPDATE integration_entity_mappings
        SET mapping_status=CASE WHEN $3 THEN 'REMOTE_DELETED' ELSE 'LINKED' END,
            metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('lastShopifyProductWebhook',$4::jsonb),
            last_synced_at=NOW(),updated_at=NOW()
      WHERE integration_id=$1 AND company_id=$2
        AND ((entity_type='product' AND external_id=ANY($5::text[]))
          OR (entity_type='product_variant' AND external_parent_id=ANY($5::text[])))`,
    [connection.id, companyId, deleted, JSON.stringify(snapshot), [productId, gid]],
  );
  return { productId, mappedCount: mappings.rows.length, deleted, canonicalDataChanged: false };
}

async function processShopifyInventoryEvent({ db, companyId, connection, credentials, payload, eventId, deliveryId }) {
  const inventoryItemId = numericShopifyId(payload?.inventory_item_id || payload?.inventoryItemId, "InventoryItem");
  const locationId = numericShopifyId(payload?.location_id || payload?.locationId, "Location");
  if (!inventoryItemId || !locationId) throw Object.assign(new Error("Shopify inventory event is missing its item or location ID"), { retryable: false });
  const itemIds = [inventoryItemId, `gid://shopify/InventoryItem/${inventoryItemId}`];
  const location = shopifyLocationMappings(credentials).find((item) =>
    numericShopifyId(item.shopifyLocationId || item.externalLocationId || item.shopify_location_id, "Location") === locationId,
  );
  const storeId = location?.storeId || location?.store_id;
  if (!storeId) throw Object.assign(new Error(`Shopify location ${locationId} has no onePOS store mapping`), { retryable: false });
  const storeResult = await db("SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=true", [storeId, companyId]);
  if (!storeResult.rows.length) throw Object.assign(new Error("Shopify inventory location maps outside this company or to an inactive store"), { retryable: false });
  const mapping = await db(
    `SELECT m.id,m.local_entity_id,p.track_stock
       FROM integration_entity_mappings m
       JOIN products p ON p.id=m.local_entity_id AND p.company_id=m.company_id AND p.active=true
      WHERE m.integration_id=$1 AND m.company_id=$2 AND m.entity_type='product_variant'
        AND m.metadata->>'inventoryItemId'=ANY($3::text[]) LIMIT 1`,
    [connection.id, companyId, itemIds],
  );
  if (!mapping.rows[0]) return { ignored: true, reason: "UNMAPPED_SHOPIFY_INVENTORY_ITEM", inventoryItemId, storeId };
  const available = Number(payload.available);
  if (!Number.isFinite(available) || available < 0) throw Object.assign(new Error("Shopify inventory level is invalid"), { retryable: false });
  const balance = await db(
    "SELECT quantity FROM product_store_stock WHERE company_id=$1 AND store_id=$2 AND product_id=$3 LIMIT 1",
    [companyId, storeId, mapping.rows[0].local_entity_id],
  );
  const canonicalQuantity = Number(balance.rows[0]?.quantity || 0);
  const observation = {
    inventoryItemId,
    locationId,
    storeId,
    available,
    canonicalQuantity,
    matchesCanonical: Math.abs(canonicalQuantity - available) < 0.0005,
    eventId: text(eventId, 200),
    deliveryId: text(deliveryId, 200),
    receivedAt: new Date().toISOString(),
  };
  await db(
    `UPDATE integration_entity_mappings
        SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),ARRAY['shopifyInventoryLocations',$3],$4::jsonb,true),
            updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [mapping.rows[0].id, companyId, locationId, JSON.stringify(observation)],
  );
  return { productId: mapping.rows[0].local_entity_id, inventoryItemId, locationId, storeId, canonicalQuantity, externalQuantity: available, syncRequired: observation.matchesCanonical !== true };
}

function customerAddress(address) {
  if (!address || typeof address !== "object") return null;
  return [address.address1, address.address2, address.city, address.province, address.zip, address.country]
    .map((part) => text(part, 160)).filter(Boolean).join(", ") || null;
}

function lineTax(line) {
  return round2((Array.isArray(line.tax_lines) ? line.tax_lines : [])
    .reduce((sum, entry) => sum + money(entry.price, "line tax"), 0));
}

function lineDiscount(line) {
  const allocations = Array.isArray(line.discount_allocations) ? line.discount_allocations : [];
  if (allocations.length) return round2(allocations.reduce((sum, entry) => sum + money(entry.amount, "line discount"), 0));
  return money(line.total_discount, "line discount");
}

async function resolveStore({ db, connection, credentials, companyId, locationId }) {
  const mappings = Array.isArray(credentials.storeLocationMappings)
    ? credentials.storeLocationMappings
    : Array.isArray(credentials.store_location_mappings) ? credentials.store_location_mappings : [];
  const mapping = locationId == null ? null : mappings.find((item) => String(item.shopifyLocationId || item.externalLocationId || item.shopify_location_id || "") === String(locationId));
  const storeId = mapping?.storeId || mapping?.store_id || credentials.defaultStoreId || credentials.default_store_id || connection.store_id;
  if (!storeId) throw new Error("Shopify order has no configured onePOS store mapping");
  const result = await db("SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=true", [storeId, companyId]);
  if (!result.rows.length) throw new Error("Shopify store mapping is not available to this company");
  return storeId;
}

async function resolveCustomer({ client, integrationId, companyId, customer }) {
  if (!customer || customer.id == null) return null;
  const externalId = String(customer.id);
  const linked = await client.query(
    `SELECT m.local_entity_id
       FROM integration_entity_mappings m
       JOIN customers c ON c.id=m.local_entity_id AND c.company_id=m.company_id
      WHERE m.integration_id=$1 AND m.company_id=$2 AND m.entity_type='customer'
        AND m.external_id=$3 AND c.active=true LIMIT 1`,
    [integrationId, companyId, externalId]
  );
  if (linked.rows[0]) return linked.rows[0].local_entity_id;

  const email = text(customer.email, 255)?.toLowerCase();
  if (!email) return null;
  const matches = await client.query(
    `SELECT id FROM customers WHERE company_id=$1 AND active=true AND lower(email)=lower($2)
      ORDER BY created_at ASC LIMIT 2`,
    [companyId, email]
  );
  let customerId = matches.rows.length === 1 ? matches.rows[0].id : null;
  if (!customerId) {
    const name = text([customer.first_name, customer.last_name].filter(Boolean).join(" ")) || email || "Shopify customer";
    const address = customer.default_address ? customerAddress(customer.default_address) : null;
    const created = await client.query(
      `INSERT INTO customers (company_id,name,email,phone,address,active)
       VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
      [companyId, name, email, text(customer.phone, 50), address],
    );
    customerId = created.rows[0]?.id || null;
  }
  if (!customerId) return null;
  await client.query(
    `INSERT INTO integration_entity_mappings
       (integration_id,company_id,entity_type,local_entity_id,external_id,metadata,last_synced_at)
     VALUES ($1,$2,'customer',$3,$4,'{}'::jsonb,NOW())
     ON CONFLICT (integration_id,entity_type,external_id) DO NOTHING`,
    [integrationId, companyId, customerId, externalId]
  );
  return customerId;
}

async function resolveOrderProduct({ client, integrationId, companyId, line }) {
  const variantId = line.variant_id == null ? null : String(line.variant_id);
  let product = null;
  if (variantId) {
    const mapped = await client.query(
      `SELECT p.id,p.name,p.sku,p.track_stock,p.batch_tracking
         FROM integration_entity_mappings m
         JOIN products p ON p.id=m.local_entity_id AND p.company_id=m.company_id AND p.active=true
        WHERE m.integration_id=$1 AND m.company_id=$2 AND m.entity_type='product_variant'
          AND m.external_id=$3 LIMIT 1`,
      [integrationId, companyId, variantId]
    );
    product = mapped.rows[0] || null;
  }
  const sku = text(line.sku, 100);
  if (!product && sku) {
    const matched = await client.query(
      `SELECT id,name,sku,track_stock,batch_tracking FROM products
        WHERE company_id=$1 AND active=true AND lower(sku)=lower($2)
        ORDER BY created_at ASC LIMIT 2`,
      [companyId, sku]
    );
    if (matched.rows.length === 1) product = matched.rows[0];
  }
  if (product && variantId) {
    await client.query(
      `INSERT INTO integration_entity_mappings
         (integration_id,company_id,entity_type,local_entity_id,external_id,metadata,last_synced_at)
       VALUES ($1,$2,'product_variant',$3,$4,$5::jsonb,NOW())
       ON CONFLICT (integration_id,entity_type,external_id) DO NOTHING`,
      [integrationId, companyId, product.id, variantId, JSON.stringify({ sku: sku || null })]
    );
  }
  return product;
}

export async function importShopifyOrder({ db, pool, companyId, connection, credentials, payload, createInventoryMovement }) {
  const externalOrderId = text(payload?.id, 255);
  const lines = Array.isArray(payload?.line_items) ? payload.line_items : [];
  if (!externalOrderId || !lines.length) throw new Error("Shopify order is missing its external ID or line items");
  const locationId = payload.location_id == null ? null : String(payload.location_id);
  const storeId = await resolveStore({ db, connection, credentials, companyId, locationId });
  const client = await pool.connect();
  let started = false;
  try {
    await client.query("BEGIN");
    started = true;
    const existing = await client.query(
      "SELECT id,status FROM online_orders WHERE company_id=$1 AND platform='shopify' AND external_order_id=$2 LIMIT 1",
      [companyId, externalOrderId]
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      started = false;
      return { duplicate: true, orderId: existing.rows[0].id, status: existing.rows[0].status };
    }

    const customerId = await resolveCustomer({ client, integrationId: connection.id, companyId, customer: payload.customer });
    const resolvedLines = [];
    for (const line of lines) {
      const quantity = Number(line.current_quantity ?? line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Shopify order has an invalid line quantity");
      const unitPrice = money(line.price, "line price");
      const discount = lineDiscount(line);
      const gross = round2(unitPrice * quantity);
      if (discount > gross) throw new Error("Shopify line discount exceeds its line value");
      const tax = lineTax(line);
      const product = await resolveOrderProduct({ client, integrationId: connection.id, companyId, line });
      resolvedLines.push({
        line,
        product,
        quantity,
        unitPrice,
        discount,
        tax,
        total: round2(gross - discount),
      });
    }

    const calculatedSubtotal = round2(resolvedLines.reduce((sum, line) => sum + line.total, 0));
    const subtotal = money(payload.subtotal_price, "subtotal", calculatedSubtotal);
    const tax = money(payload.total_tax, "tax", resolvedLines.reduce((sum, line) => sum + line.tax, 0));
    const shippingLines = Array.isArray(payload.shipping_lines) ? payload.shipping_lines : [];
    const deliveryFee = round2(shippingLines.reduce((sum, line) => sum + money(line.discounted_price ?? line.price, "shipping charge"), 0));
    const total = money(payload.current_total_price ?? payload.total_price, "total", round2(subtotal + tax + deliveryFee));
    const shopCustomer = payload.customer || {};
    const shippingAddress = payload.shipping_address || payload.billing_address || {};
    const customerName = text([shopCustomer.first_name, shopCustomer.last_name].filter(Boolean).join(" ")) || text(shippingAddress.name);
    const customerEmail = text(shopCustomer.email || payload.email, 255);
    const customerPhone = text(shopCustomer.phone || shippingAddress.phone, 50);
    const address = customerAddress(shippingAddress);
    const currency = text(payload.currency || payload.presentment_currency, 10) || "GBP";
    const paymentStatus = text(payload.financial_status, 40) || "pending";
    const reference = text(payload.name || payload.order_number, 255) || externalOrderId;
    const platformData = JSON.stringify({
      source: "shopify",
      orderId: externalOrderId,
      locationId,
      fulfillmentStatus: text(payload.fulfillment_status, 40),
      financialStatus: paymentStatus,
    });
    const orderResult = await client.query(
      `INSERT INTO online_orders
         (company_id,store_id,customer_id,platform,external_order_id,external_reference,status,fulfilment_type,
          customer_name,customer_phone,customer_email,delivery_address,customer_data,currency,subtotal,tax,delivery_fee,
          total,notes,payment_method,payment_status,platform_data,inventory_reserved)
       VALUES ($1,$2,$3,'shopify',$4,$5,'RECEIVED',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'shopify',$18,$19::jsonb,FALSE)
       ON CONFLICT (company_id,platform,external_order_id) DO NOTHING RETURNING *`,
      [
        companyId, storeId, customerId, externalOrderId, reference,
        shippingAddress && Object.keys(shippingAddress).length ? "DELIVERY" : "COLLECTION",
        customerName, customerPhone, customerEmail, address,
        JSON.stringify({ id: customerId, externalId: shopCustomer.id == null ? null : String(shopCustomer.id), name: customerName, email: customerEmail, phone: customerPhone, address }),
        currency, subtotal, tax, deliveryFee, total, text(payload.note, 2000), paymentStatus,
        platformData,
      ]
    );
    const order = orderResult.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      started = false;
      const duplicate = await db("SELECT id,status FROM online_orders WHERE company_id=$1 AND platform='shopify' AND external_order_id=$2 LIMIT 1", [companyId, externalOrderId]);
      return { duplicate: true, orderId: duplicate.rows[0]?.id || null, status: duplicate.rows[0]?.status || null };
    }

    let reserved = false;
    for (const item of resolvedLines) {
      const line = item.line;
      const externalItemId = line.variant_id == null ? String(line.id || "") : String(line.variant_id);
      await client.query(
        `INSERT INTO online_order_items
           (order_id,product_id,external_item_id,product_name,quantity,unit_price,tax,total,mapping_status,platform_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          order.id, item.product?.id || null, externalItemId || null,
          text(line.title || item.product?.name, 255) || "Shopify item", item.quantity,
          item.unitPrice, item.tax, item.total, item.product ? "MAPPED" : "UNMAPPED",
          JSON.stringify({ lineItemId: line.admin_graphql_api_id || (line.id == null ? null : `gid://shopify/LineItem/${line.id}`), lineItemNumericId: line.id == null ? null : String(line.id), sku: text(line.sku, 100), variantId: line.variant_id == null ? null : String(line.variant_id), discount: item.discount }),
        ]
      );
      if (!item.product?.track_stock) continue;
      if (typeof createInventoryMovement !== "function") throw new Error("Canonical inventory movement service is unavailable");
      await createInventoryMovement(client, {
        companyId,
        productId: item.product.id,
        storeId,
        movementType: "ONLINE_RESERVE",
        quantityChange: -item.quantity,
        referenceType: "ONLINE_ORDER",
        referenceId: order.id,
        reason: `Reserved for Shopify order ${reference}`,
        createdBy: null,
      });
      await syncBatchMovement(client, {
        companyId,
        storeId,
        productId: item.product.id,
        quantityChange: -item.quantity,
        batchTracked: item.product.batch_tracking === true,
      });
      reserved = true;
    }

    if (reserved) await client.query("UPDATE online_orders SET inventory_reserved=true WHERE id=$1 AND company_id=$2", [order.id, companyId]);
    await client.query(
      `INSERT INTO online_order_events (order_id,event_type,to_status,message,platform_response)
       VALUES ($1,'SHOPIFY_IMPORTED','RECEIVED','Order imported from Shopify',$2::jsonb)`,
      [order.id, JSON.stringify({ shopifyOrderId: externalOrderId, deliveryId: null })]
    );
    await client.query(
      `INSERT INTO integration_entity_mappings
         (integration_id,company_id,store_id,entity_type,local_entity_id,external_id,metadata,last_synced_at)
       VALUES ($1,$2,$3,'online_order',$4,$5,$6::jsonb,NOW())
       ON CONFLICT (integration_id,entity_type,external_id) DO NOTHING`,
      [connection.id, companyId, storeId, order.id, externalOrderId, JSON.stringify({ reference })]
    );
    await client.query("COMMIT");
    started = false;
    return { duplicate: false, orderId: order.id, status: order.status, itemCount: resolvedLines.length, unmappedCount: resolvedLines.filter((line) => !line.product).length };
  } catch (error) {
    if (started) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function processShopifyRefundEvent({ db, pool, companyId, connection, payload, eventId, deliveryId, createInventoryMovement }) {
  const externalOrderId = text(payload?.order_id || payload?.order?.id, 255);
  const refundId = text(payload?.id, 255);
  if (!externalOrderId || !refundId) throw Object.assign(new Error("Shopify refund is missing its order or refund ID"), { retryable: false });
  const client = await pool.connect();
  let started = false;
  try {
    await client.query("BEGIN");
    started = true;
    const orderResult = await client.query(
      `SELECT id,company_id,store_id,total,payment_status,delivery_fee
         FROM online_orders
        WHERE company_id=$1 AND platform='shopify' AND external_order_id=$2 FOR UPDATE`,
      [companyId, externalOrderId],
    );
    const order = orderResult.rows[0];
    if (!order) throw Object.assign(new Error("Shopify order has not been imported yet"), { retryable: true });
    const duplicate = await client.query(
      `SELECT id FROM online_order_events
        WHERE order_id=$1 AND event_type='SHOPIFY_REFUNDED' AND platform_response->>'refundId'=$2 LIMIT 1`,
      [order.id, refundId],
    );
    if (duplicate.rows[0]) {
      await client.query("ROLLBACK");
      started = false;
      return { duplicate: true, orderId: order.id, refundId };
    }

    const store = await client.query("SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=true", [order.store_id, companyId]);
    if (!store.rows.length) throw Object.assign(new Error("Shopify refund store is not available to this company"), { retryable: false });
    const orderLines = await client.query(
      `SELECT i.id,i.external_item_id,i.product_id,i.quantity,i.platform_data,
              p.track_stock,p.batch_tracking
         FROM online_order_items i
         LEFT JOIN products p ON p.id=i.product_id AND p.company_id=$2 AND p.active=true
        WHERE i.order_id=$1 ORDER BY i.created_at,i.id`,
      [order.id, companyId],
    );
    const refundLines = Array.isArray(payload.refund_line_items) ? payload.refund_line_items : [];
    const matchedLines = [];
    for (const line of refundLines) {
      const lineItemId = numericShopifyId(line.line_item_id || line.line_item?.admin_graphql_api_id || line.line_item?.id, "LineItem");
      const quantity = Number(line.quantity);
      if (!lineItemId || !Number.isFinite(quantity) || quantity <= 0) throw Object.assign(new Error("Shopify refund line is invalid"), { retryable: false });
      const item = (orderLines.rows || []).find((candidate) => mappedShopifyLineId(candidate) === lineItemId);
      if (!item) throw Object.assign(new Error(`Shopify refund line ${lineItemId} is not mapped to this order`), { retryable: false });
      matchedLines.push({
        item,
        lineItemId,
        quantity,
        restock: ["return", "legacy_restock"].includes(String(line.restock_type || "").toLowerCase()),
        restockType: String(line.restock_type || "").toLowerCase() || "no_restock",
        source: line,
      });
    }
    const transactions = Array.isArray(payload.transactions) ? payload.transactions : [];
    const transactionAmount = transactions
      .filter((item) => String(item.kind || "").toLowerCase() === "refund")
      .reduce((sum, item) => sum + money(item.amount, "refund amount"), 0);
    const lineAmount = refundLines.reduce((sum, item) => {
      const subtotal = money(item.subtotal, "refund line subtotal");
      const tax = money(item.total_tax, "refund line tax");
      return sum + subtotal + tax;
    }, 0);
    const amount = round2(transactionAmount || lineAmount);
    if (amount <= 0) throw Object.assign(new Error("Shopify refund amount is invalid"), { retryable: false });
    const priorRefunds = await client.query(
      `SELECT platform_response FROM online_order_events WHERE order_id=$1 AND event_type='SHOPIFY_REFUNDED'`,
      [order.id],
    );
    const priorResponses = (priorRefunds.rows || []).map((row) => parseJson(row.platform_response));
    const refundedTotal = round2(amount + priorResponses.reduce((sum, response) => sum + money(response.amount, "previous refund amount"), 0));
    if (refundedTotal > Number(order.total) + Number(order.delivery_fee || 0) + 0.01) {
      throw Object.assign(new Error("Shopify refunds exceed the imported order total"), { retryable: false });
    }
    const priorRestocked = new Map();
    const priorRefundedQuantities = new Map();
    for (const response of priorResponses) {
      for (const line of response.restockedLines || []) {
        priorRestocked.set(line.orderItemId, (priorRestocked.get(line.orderItemId) || 0) + Number(line.quantity || 0));
      }
      for (const line of response.lineItems || []) {
        const lineId = numericShopifyId(line.line_item_id || line.line_item?.admin_graphql_api_id || line.line_item?.id, "LineItem");
        if (lineId) priorRefundedQuantities.set(lineId, (priorRefundedQuantities.get(lineId) || 0) + Number(line.quantity || 0));
      }
    }
    const incomingRefundedQuantities = new Map();
    for (const line of matchedLines) {
      incomingRefundedQuantities.set(line.lineItemId, (incomingRefundedQuantities.get(line.lineItemId) || 0) + line.quantity);
    }
    for (const [lineItemId, quantity] of incomingRefundedQuantities) {
      const orderItem = orderLines.rows.find((item) => mappedShopifyLineId(item) === lineItemId);
      const alreadyRefunded = priorRefundedQuantities.get(lineItemId) || 0;
      if (!orderItem || alreadyRefunded + quantity > Number(orderItem.quantity) + 0.0005) {
        throw Object.assign(new Error("Shopify refund quantity exceeds the original order line quantity"), { retryable: false });
      }
    }
    const restockedLines = [];
    for (const line of matchedLines.filter((candidate) => candidate.restock && candidate.item.product_id && candidate.item.track_stock === true)) {
      const already = priorRestocked.get(line.item.id) || 0;
      if (already + line.quantity > Number(line.item.quantity) + 0.0005) {
        throw Object.assign(new Error("Shopify restocked refund quantity exceeds the original order quantity"), { retryable: false });
      }
      restockedLines.push({ orderItemId: line.item.id, productId: line.item.product_id, quantity: line.quantity, batchTracked: line.item.batch_tracking === true });
    }

    const saleResult = await client.query("SELECT id,user_id FROM sales WHERE online_order_id=$1 AND company_id=$2 LIMIT 1", [order.id, companyId]);
    const sale = saleResult.rows[0] || null;
    const returnResult = await client.query(
      `INSERT INTO stock_returns
         (company_id,store_id,return_type,sale_id,request_key,status,refund_amount,refund_method,reason,created_by)
       VALUES ($1,$2,'CUSTOMER',$3,$4,'COMPLETED',$5,'Shopify',$6,$7) RETURNING id`,
      [companyId, order.store_id, sale?.id || null, `shopify-refund:${connection.id}:${refundId}`, amount, `Shopify refund ${refundId}`, sale?.user_id || null],
    );
    const returnId = returnResult.rows[0].id;
    const returnedByOrderItem = new Map();
    for (const line of matchedLines) {
      returnedByOrderItem.set(line.item.id, (returnedByOrderItem.get(line.item.id) || 0) + line.quantity);
    }
    for (const [orderItemId, quantity] of returnedByOrderItem) {
      const item = orderLines.rows.find((candidate) => candidate.id === orderItemId);
      if (!item.product_id) continue;
      let remaining = quantity;
      const saleItems = sale ? await client.query(
        `SELECT si.id,si.quantity,COALESCE(returned.quantity,0) AS returned_quantity
           FROM sale_items si
           LEFT JOIN (
             SELECT sri.sale_item_id,SUM(sri.quantity) AS quantity
               FROM stock_return_items sri JOIN stock_returns sr ON sr.id=sri.return_id
              WHERE sr.sale_id=$1 AND sr.return_type='CUSTOMER' AND sr.status='COMPLETED'
              GROUP BY sri.sale_item_id
           ) returned ON returned.sale_item_id=si.id
          WHERE si.sale_id=$1 AND si.product_id=$2 ORDER BY si.id FOR UPDATE`,
        [sale.id, item.product_id],
      ) : { rows: [] };
      for (const saleItem of saleItems.rows) {
        const available = Math.max(0, Number(saleItem.quantity) - Number(saleItem.returned_quantity));
        const allocated = Math.min(remaining, available);
        if (allocated <= 0) continue;
        await client.query(
          "INSERT INTO stock_return_items (return_id,product_id,sale_item_id,quantity,reason) VALUES ($1,$2,$3,$4,$5)",
          [returnId, item.product_id, saleItem.id, allocated, `Shopify refund ${refundId}`],
        );
        remaining -= allocated;
        if (remaining <= 0.0005) break;
      }
      if (remaining > 0.0005) {
        await client.query(
          "INSERT INTO stock_return_items (return_id,product_id,sale_item_id,quantity,reason) VALUES ($1,$2,NULL,$3,$4)",
          [returnId, item.product_id, remaining, `Shopify refund ${refundId}`],
        );
      }
    }
    for (const line of restockedLines) {
      if (typeof createInventoryMovement !== "function") throw new Error("Canonical inventory movement service is unavailable");
      await createInventoryMovement(client, {
        companyId,
        productId: line.productId,
        storeId: order.store_id,
        movementType: "CUSTOMER_RETURN",
        quantityChange: line.quantity,
        referenceType: "ONLINE_ORDER_REFUND",
        referenceId: returnId,
        reason: `Restocked Shopify refund ${refundId}`,
        createdBy: null,
      });
      await syncBatchMovement(client, {
        companyId,
        storeId: order.store_id,
        productId: line.productId,
        quantityChange: line.quantity,
        batchTracked: line.batchTracked,
        batchNumber: `RETURNS-${returnId.slice(0, 8).toUpperCase()}`,
      });
    }
    if (sale?.user_id) {
      await client.query(
        `INSERT INTO refunds (sale_id,user_id,amount,reason,payment_method,return_id)
         VALUES ($1,$2,$3,$4,'Shopify',$5)`,
        [sale.id, sale.user_id, amount, `Shopify refund ${refundId}`, returnId],
      );
    }
    const paymentStatus = refundedTotal >= Number(order.total) - 0.01 ? "refunded" : "partially_refunded";
    await client.query("UPDATE online_orders SET payment_status=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [paymentStatus, order.id, companyId]);
    await client.query(
      `INSERT INTO integration_entity_mappings
         (integration_id,company_id,store_id,entity_type,local_entity_id,external_id,external_parent_id,metadata,last_synced_at)
       VALUES ($1,$2,$3,'refund',$4,$5,$6,$7::jsonb,NOW())
       ON CONFLICT (integration_id,entity_type,external_id) DO NOTHING`,
      [connection.id, companyId, order.store_id, returnId, refundId, externalOrderId, JSON.stringify({ amount, inbound: true })],
    );
    await client.query(
      `INSERT INTO online_order_events (order_id,event_type,message,platform_response)
       VALUES ($1,'SHOPIFY_REFUNDED',$2,$3::jsonb)`,
      [order.id, `Shopify refund ${refundId} imported`, JSON.stringify({ refundId, amount, refundedTotal, returnId, paymentStatus, restockedLines, lineItems: refundLines, eventId, deliveryId })],
    );
    await client.query("COMMIT");
    started = false;
    return { duplicate: false, orderId: order.id, refundId, returnId, amount, refundedTotal, paymentStatus, restockedCount: restockedLines.length };
  } catch (error) {
    if (started) await client.query("ROLLBACK");
    await db("UPDATE integration_connections SET last_error=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3", [String(error?.message || "Shopify refund import failed").slice(0, 500), connection.id, companyId]).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function processShopifyWebhookEvent({ db, pool, companyId, connection, credentials, event, createInventoryMovement }) {
  const { topic, payload } = event;
  if (topic === "orders/create") {
    return importShopifyOrder({ db, pool, companyId, connection, credentials, payload, createInventoryMovement });
  }
  if (["products/create", "products/update", "products/delete"].includes(topic)) {
    return processShopifyProductEvent({ db, companyId, connection, topic, payload, eventId: event.eventId, deliveryId: event.deliveryId });
  }
  if (topic === "inventory_levels/update") {
    return processShopifyInventoryEvent({ db, companyId, connection, credentials, payload, eventId: event.eventId, deliveryId: event.deliveryId });
  }
  if (topic === "orders/cancelled") {
    const externalOrderId = text(payload?.id, 255);
    if (!externalOrderId) throw new Error("Shopify cancellation has no order ID");
    const result = await db(
      "SELECT id,status FROM online_orders WHERE company_id=$1 AND platform='shopify' AND external_order_id=$2 LIMIT 1",
      [companyId, externalOrderId]
    );
    if (!result.rows[0]) throw Object.assign(new Error("Shopify order has not been imported yet"), { retryable: true });
    if (["CANCELLED", "COMPLETED", "REJECTED"].includes(result.rows[0].status)) return { duplicate: true, orderId: result.rows[0].id, status: result.rows[0].status };
    const transition = await transitionGenericOrder({
      pool,
      companyId,
      orderId: result.rows[0].id,
      toStatus: "CANCELLED",
      reason: text(payload.cancel_reason || "Shopify order cancelled", 500),
      createInventoryMovement,
    });
    if (!transition.success) throw Object.assign(new Error(transition.error || "Shopify cancellation could not be applied"), { retryable: false });
    return { orderId: result.rows[0].id, status: "CANCELLED" };
  }
  if (topic === "orders/updated" || topic === "orders/fulfilled" || topic === "fulfillments/create" || topic === "fulfillments/update") {
    const externalOrderId = text(payload?.id || payload?.order_id, 255);
    if (!externalOrderId) throw new Error("Shopify status event has no order ID");
    const result = await db(
      "SELECT id,status,fulfilment_type FROM online_orders WHERE company_id=$1 AND platform='shopify' AND external_order_id=$2 LIMIT 1",
      [companyId, externalOrderId],
    );
    if (!result.rows[0]) throw Object.assign(new Error("Shopify order has not been imported yet"), { retryable: true });
    const order = result.rows[0];
    const fulfilled = topic.includes("fulfilled") || topic.startsWith("fulfillments/") || payload?.fulfillment_status === "fulfilled";
    if (!fulfilled || ["COMPLETED", "CANCELLED", "REJECTED"].includes(order.status)) return { orderId: order.id, status: order.status, ignored: true };
    const transition = await transitionGenericOrder({ pool, companyId, orderId: order.id, toStatus: "COMPLETED", reason: "Shopify fulfilment completed", createInventoryMovement });
    if (!transition.success) return { orderId: order.id, status: order.status, ignored: true, message: transition.error };
    return { orderId: order.id, status: "COMPLETED" };
  }
  if (topic === "refunds/create") {
    return processShopifyRefundEvent({ db, pool, companyId, connection, payload, eventId: event.eventId, deliveryId: event.deliveryId, createInventoryMovement });
  }
  return { success: true, ignored: true, topic };
}
