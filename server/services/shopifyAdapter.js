import { createHmac, timingSafeEqual } from "node:crypto";

const SHOPIFY_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i;
const API_VERSION_RE = /^20\d{2}-(01|04|07|10)$/;

export function verifyShopifyWebhook(rawBody, signature, secret) {
  if ((!Buffer.isBuffer(rawBody) && typeof rawBody !== "string") || !signature || !secret) return false;
  let provided;
  try {
    provided = Buffer.from(String(signature), "base64");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", String(secret)).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function getShopHost(shopDomain) {
  const host = String(shopDomain || "").trim().toLowerCase();
  if (!SHOPIFY_DOMAIN_RE.test(host)) throw new Error("Shopify shop domain must be a myshopify.com host");
  return host;
}

async function readTokenResponse(response, operation) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = new Error(`Shopify ${operation} failed (${response.status})`);
    error.status = response.status;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  if (!body?.access_token || !body?.refresh_token || !Number.isFinite(Number(body.expires_in))) {
    throw new Error(`Shopify ${operation} returned incomplete offline credentials`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresIn: Number(body.expires_in),
    refreshTokenExpiresIn: Number(body.refresh_token_expires_in) || null,
    scopes: String(body.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean),
  };
}

export function createShopifyAdapter({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  async function exchangeAuthorizationCode({ shopDomain, clientId, clientSecret, code }) {
    const host = getShopHost(shopDomain);
    const id = String(clientId || "").trim();
    const secret = String(clientSecret || "").trim();
    const authorizationCode = String(code || "").trim();
    if (!id || !secret || !authorizationCode) throw new Error("Shopify authorization credentials are incomplete");
    let response;
    try {
      response = await fetchImpl(`https://${host}/admin/oauth/access_token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secret, code: authorizationCode, expiring: "1" }),
      });
    } catch {
      throw new Error("Shopify authorization request failed");
    }
    return readTokenResponse(response, "authorization exchange");
  }

  async function refreshAuthentication({ shopDomain, clientId, clientSecret, refreshToken }) {
    const host = getShopHost(shopDomain);
    const id = String(clientId || "").trim();
    const secret = String(clientSecret || "").trim();
    const token = String(refreshToken || "").trim();
    if (!id || !secret || !token) throw new Error("Shopify refresh credentials are incomplete");
    let response;
    try {
      response = await fetchImpl(`https://${host}/admin/oauth/access_token`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "refresh_token", refresh_token: token }),
      });
    } catch {
      const error = new Error("Shopify token refresh request failed");
      error.retryable = true;
      throw error;
    }
    return readTokenResponse(response, "token refresh");
  }

  async function graphqlRequest({ shopDomain, apiVersion = "2026-07", accessToken, query, variables = {} }) {
    const host = getShopHost(shopDomain);
    if (!API_VERSION_RE.test(String(apiVersion || ""))) throw new Error("Shopify API version is invalid");
    const token = String(accessToken || "").trim();
    const document = String(query || "").trim();
    if (!token || !document) throw new Error("Shopify GraphQL credentials and query are required");
    let response;
    try {
      response = await fetchImpl(`https://${host}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: document, variables }),
      });
    } catch {
      const error = new Error("Shopify GraphQL request failed");
      error.retryable = true;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(`Shopify GraphQL request failed (${response.status})`);
      error.status = response.status;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    try {
      const result = await response.json();
      if (Array.isArray(result?.errors) && result.errors.length) {
        const error = new Error("Shopify rejected the GraphQL operation");
        error.retryable = result.errors.some((entry) => ["THROTTLED", "INTERNAL_SERVER_ERROR"].includes(entry?.extensions?.code));
        throw error;
      }
      if (!result?.data) throw new Error("Shopify returned an invalid GraphQL response");
      return result.data;
    } catch (error) {
      if (error?.message === "Shopify rejected the GraphQL operation") throw error;
      const failure = new Error("Shopify GraphQL request failed");
      failure.retryable = true;
      throw failure;
    }
  }

  async function testConnection(connection) {
    const data = await graphqlRequest({
      ...connection,
      query: "query OnePosConnectionTest { shop { id name myshopifyDomain currencyCode } }",
    });
    const shop = data?.shop;
    if (!shop) throw new Error("Shopify shop information was not returned");
    return {
      connected: true,
      shopId: String(shop.id || ""),
      shopName: String(shop.name || ""),
      shopDomain: String(shop.myshopifyDomain || connection.shopDomain),
      currency: String(shop.currencyCode || ""),
    };
  }

  async function upsertProduct({ shopDomain, apiVersion, accessToken, product }) {
    if (!product || typeof product !== "object") throw new Error("Shopify product data is required");
    const variantInput = (Array.isArray(product.variants) ? product.variants : []).map((variant) => ({
      id: variant.externalId || variant.id || undefined,
      price: String(variant.price ?? 0),
      barcode: variant.barcode || undefined,
      inventoryItem: variant.inventoryItemId ? { id: variant.inventoryItemId } : undefined,
      optionValues: Array.isArray(variant.options)
        ? variant.options.map((option) => ({ optionName: String(option.name), name: String(option.value) }))
        : undefined,
    }));
    const input = {
      title: String(product.title || product.name || "").trim(),
      descriptionHtml: product.description == null ? undefined : String(product.description),
      status: product.active === false ? "DRAFT" : "ACTIVE",
      variants: variantInput,
    };
    if (!input.title) throw new Error("Shopify product title is required");
    const data = await graphqlRequest({
      shopDomain, apiVersion, accessToken,
      query: `mutation OnePosProductSet($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
        productSet(input: $input, identifier: $identifier) {
          product { id title status variants(first: 100) { nodes { id sku barcode price inventoryItem { id } selectedOptions { name value } } } }
          userErrors { field message }
        }
      }`,
      variables: {
        input,
        identifier: product.externalId ? { id: String(product.externalId) } : undefined,
      },
    });
    const errors = data?.productSet?.userErrors || [];
    if (errors.length) throw new Error(`Shopify product sync failed: ${errors.map((entry) => entry.message).join("; ")}`);
    if (!data?.productSet?.product?.id) throw new Error("Shopify product sync returned no product");
    return data.productSet.product;
  }

  async function updateInventoryLevel({ shopDomain, apiVersion, accessToken, inventoryItemId, locationId, quantity }) {
    if (!inventoryItemId || !locationId) throw new Error("Shopify inventory item and location are required");
    const data = await graphqlRequest({
      shopDomain, apiVersion, accessToken,
      query: `mutation OnePosInventorySet($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          inventoryAdjustmentGroup { createdAt reason referenceDocumentUri }
          userErrors { field message }
        }
      }`,
      variables: {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [{ inventoryItemId: String(inventoryItemId), locationId: String(locationId), quantity: Number(quantity) }],
        },
      },
    });
    const errors = data?.inventorySetQuantities?.userErrors || [];
    if (errors.length) throw new Error(`Shopify inventory sync failed: ${errors.map((entry) => entry.message).join("; ")}`);
    return data.inventorySetQuantities;
  }

  function shopifyOrderId(orderId) {
    const value = String(orderId || "").trim();
    return value.startsWith("gid://shopify/Order/") ? value : `gid://shopify/Order/${value}`;
  }

  async function getFulfillmentOrders({ shopDomain, apiVersion, accessToken, orderId }) {
    const data = await graphqlRequest({
      shopDomain, apiVersion, accessToken,
      query: `query OnePosFulfillmentOrders($orderId: ID!) {
        order(id: $orderId) { fulfillmentOrders(first: 100) {
          nodes { id status lineItems(first: 100) { nodes { id quantity lineItem { id } } } }
        } }
      }`,
      variables: { orderId: shopifyOrderId(orderId) },
    });
    return data?.order?.fulfillmentOrders?.nodes || [];
  }

  async function createFulfillment({ shopDomain, apiVersion, accessToken, orderId, lineItems, notifyCustomer = true }) {
    const fulfillmentOrders = await getFulfillmentOrders({ shopDomain, apiVersion, accessToken, orderId });
    const fulfillmentOrderLineItems = [];
    for (const requested of Array.isArray(lineItems) ? lineItems : []) {
      const match = fulfillmentOrders.flatMap((order) => order.lineItems?.nodes || [])
        .find((item) => String(item.lineItem?.id || item.id) === String(requested.lineItemId));
      if (!match) throw new Error(`Shopify fulfilment line ${requested.lineItemId} was not found`);
      const fulfillmentOrder = fulfillmentOrders.find((order) => (order.lineItems?.nodes || []).some((item) => item.id === match.id));
      fulfillmentOrderLineItems.push({ fulfillmentOrderId: fulfillmentOrder.id, fulfillmentOrderLineItemId: match.id, quantity: Number(requested.quantity) });
    }
    if (!fulfillmentOrderLineItems.length) throw new Error("Shopify fulfilment has no eligible line items");
    const data = await graphqlRequest({
      shopDomain, apiVersion, accessToken,
      query: `mutation OnePosFulfillmentCreate($fulfillment: FulfillmentInput!) {
        fulfillmentCreate(fulfillment: $fulfillment) {
          fulfillment { id status }
          userErrors { field message }
        }
      }`,
      variables: { fulfillment: { lineItemsByFulfillmentOrder: fulfillmentOrderLineItems.reduce((groups, item) => {
        const group = groups.find((candidate) => candidate.fulfillmentOrderId === item.fulfillmentOrderId);
        if (group) group.fulfillmentOrderLineItems.push({ id: item.fulfillmentOrderLineItemId, quantity: item.quantity });
        else groups.push({ fulfillmentOrderId: item.fulfillmentOrderId, fulfillmentOrderLineItems: [{ id: item.fulfillmentOrderLineItemId, quantity: item.quantity }] });
        return groups;
      }, []), notifyCustomer } },
    });
    const errors = data?.fulfillmentCreate?.userErrors || [];
    if (errors.length) throw new Error(`Shopify fulfilment failed: ${errors.map((entry) => entry.message).join("; ")}`);
    if (!data?.fulfillmentCreate?.fulfillment?.id) throw new Error("Shopify fulfilment returned no fulfilment ID");
    return data.fulfillmentCreate.fulfillment;
  }

  async function findRefundByReference({ shopDomain, apiVersion, accessToken, orderId, reference }) {
    const data = await graphqlRequest({
      shopDomain, apiVersion, accessToken,
      query: `query OnePosOrderRefunds($orderId: ID!) {
        order(id: $orderId) {
          refunds(first: 100) { nodes { id note createdAt totalRefundedSet { shopMoney { amount currencyCode } } } }
        }
      }`,
      variables: { orderId: shopifyOrderId(orderId) },
    });
    return (data?.order?.refunds?.nodes || []).find((refund) => String(refund.note || "").includes(reference)) || null;
  }

  async function createRefund({ shopDomain, apiVersion, accessToken, orderId, amount, lineItems, reference, note = "", notifyCustomer = false }) {
    if (!reference || !Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error("Shopify refund reference and amount are required");
    const prior = await findRefundByReference({ shopDomain, apiVersion, accessToken, orderId, reference });
    if (prior) return { ...prior, duplicate: true };

    const orderData = await graphqlRequest({
      shopDomain, apiVersion, accessToken,
      query: `query OnePosRefundTransactions($orderId: ID!) {
        order(id: $orderId) { transactions(first: 100) { nodes { id kind status amount gateway } } }
      }`,
      variables: { orderId: shopifyOrderId(orderId) },
    });
    const transactions = orderData?.order?.transactions?.nodes || [];
    const parent = transactions.find((transaction) =>
      ["SUCCESS", "PENDING"].includes(String(transaction.status || "").toUpperCase())
      && ["SALE", "CAPTURE"].includes(String(transaction.kind || "").toUpperCase()),
    );
    if (!parent?.id || !parent.gateway) throw new Error("Shopify has no successful payment transaction available to refund");

    const data = await graphqlRequest({
      shopDomain, apiVersion, accessToken,
      query: `mutation OnePosRefundCreate($input: RefundInput!) {
        refundCreate(input: $input) {
          refund { id note createdAt totalRefundedSet { shopMoney { amount currencyCode } } }
          userErrors { field message }
        }
      }`,
      variables: {
        input: {
          orderId: shopifyOrderId(orderId),
          note: `${note ? `${String(note).slice(0, 350)} | ` : ""}${reference}`,
          notify: notifyCustomer,
          refundLineItems: (Array.isArray(lineItems) ? lineItems : []).map((line) => ({
            lineItemId: String(line.lineItemId),
            quantity: Number(line.quantity),
            restockType: line.restock === true ? "RETURN" : "NO_RESTOCK",
          })),
          transactions: [{ parentId: parent.id, amount: Number(amount).toFixed(2), kind: "REFUND", gateway: parent.gateway }],
        },
      },
    });
    const errors = data?.refundCreate?.userErrors || [];
    if (errors.length) throw new Error(`Shopify refund failed: ${errors.map((entry) => entry.message).join("; ")}`);
    if (!data?.refundCreate?.refund?.id) throw new Error("Shopify refund returned no refund ID");
    return { ...data.refundCreate.refund, duplicate: false };
  }

  return Object.freeze({ exchangeAuthorizationCode, refreshAuthentication, graphqlRequest, testConnection, upsertProduct, updateInventoryLevel, getFulfillmentOrders, createFulfillment, findRefundByReference, createRefund, verifyWebhook: verifyShopifyWebhook });
}