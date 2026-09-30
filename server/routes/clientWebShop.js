import crypto from "node:crypto";
import express from "express";
import { createGenericOrder } from "../services/onlineOrders/genericOrderService.js";
import { transitionGenericOrder } from "../services/onlineOrders/genericOrderService.js";
import { resolvePrice } from "../services/pricingEngine.js";
import { getAllowedPaymentMethodCodes } from "../services/paymentMethods.js";
import { createSandboxOnlinePaymentProvider } from "../services/paymentCore/onlineCheckout.js";
import { decryptSecret, encryptSecret } from "../services/onlineOrders/platformConfig.js";

const SHOP_PLATFORM = "client_web_shop";
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

function paymentOptions(shop, allowedMethods = []) {
  const enabled = Array.isArray(shop.online_payment_methods) ? shop.online_payment_methods : ["card", "cash", "cod"];
  const options = [];
  if (shop.client_web_shop_pickup_enabled === true && enabled.includes("cash") && allowedMethods.includes("cash")) {
    options.push({ code: "cash", label: "Pay at pickup", fulfilmentType: "SELF_PICKUP" });
  }
  if (shop.client_web_shop_delivery_enabled === true && enabled.includes("cod") && allowedMethods.includes("cash")) {
    options.push({ code: "cod", label: "Cash on delivery", fulfilmentType: "DELIVERY" });
  }
  if (shop.client_web_shop_sandbox_payments_enabled === true && enabled.includes("card") && allowedMethods.includes("card")) {
    options.push({ code: "sandbox_card", label: "Card (sandbox)", fulfilmentType: "ANY" });
  }
  return options;
}
const SHOP_PRODUCT_QUERY = `SELECT p.id,p.name,p.description,p.image_url,p.category_id,p.product_kind,p.parent_product_id,
    p.variant_attributes,p.price,p.web_shop_price_override,p.vat_rate,p.vat_applicable,p.track_stock,p.stock_quantity,
    p.web_shop_title_override,p.web_shop_description_override,p.web_shop_image_override,p.web_shop_featured,
    p.web_shop_delivery_eligible,p.web_shop_pickup_eligible,p.web_shop_category_override,p.web_shop_sort_order,
    cs.vat_enabled,c.name AS category_name,pss.quantity AS store_quantity,shop_prices.price AS price_list_price,
    scheduled.price AS scheduled_price,scheduled.starts_at AS scheduled_starts_at,
    scheduled.ends_at AS scheduled_ends_at,COALESCE(promo.rows,'[]'::jsonb) AS promotions
  FROM products p
  JOIN company_settings cs ON cs.company_id=p.company_id
  LEFT JOIN categories c ON c.id=COALESCE(p.web_shop_category_override,p.category_id) AND c.company_id=p.company_id AND c.active=true
  LEFT JOIN product_store_stock pss ON pss.company_id=p.company_id AND pss.store_id=$2 AND pss.product_id=p.id
  LEFT JOIN LATERAL (
    SELECT plp.price FROM price_list_prices plp
    JOIN price_lists pl ON pl.id=plp.price_list_id AND pl.company_id=p.company_id AND pl.active=true
    WHERE plp.product_id=p.id AND plp.price_list_id=$6 LIMIT 1
  ) shop_prices ON true
  LEFT JOIN LATERAL (
    SELECT price,starts_at,ends_at FROM scheduled_product_prices
     WHERE company_id=p.company_id AND product_id=p.id AND active=true
       AND starts_at<=NOW() AND (ends_at IS NULL OR ends_at>NOW())
     ORDER BY starts_at DESC LIMIT 1
  ) scheduled ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('id',id,'discount_type',discount_type,'discount_value',discount_value,
      'starts_at',starts_at,'ends_at',ends_at,'buy_quantity',buy_quantity,'get_quantity',get_quantity,
      'offer_type',offer_type,'set_price',set_price,'discount_percent',discount_percent)) AS rows
      FROM promotions WHERE company_id=p.company_id AND active=true
        AND (product_id=p.id OR (product_id IS NULL AND category_id=COALESCE(p.web_shop_category_override,p.category_id)))
        AND (starts_at IS NULL OR starts_at<=NOW()) AND (ends_at IS NULL OR ends_at>NOW())
  ) promo ON true
 WHERE p.company_id=$1 AND p.active=true AND p.web_shop_published=true AND p.name<>'Misc Item'
   AND (p.web_shop_publish_start IS NULL OR p.web_shop_publish_start <= NOW())
   AND (p.web_shop_publish_end IS NULL OR p.web_shop_publish_end > NOW())
   AND ($3::text IS NULL OR p.name ILIKE '%' || $3 || '%' OR p.description ILIKE '%' || $3 || '%')
   AND ($4::uuid IS NULL OR COALESCE(p.web_shop_category_override,p.category_id)=$4)
   AND ($5::uuid[] IS NULL OR p.id=ANY($5::uuid[]))
 ORDER BY c.display_order NULLS LAST,c.name,p.web_shop_sort_order,p.name`;

function safeProduct(row, quantity = 1) {
  const explicitOverride = row.web_shop_price_override == null ? null : Number(row.web_shop_price_override);
  const price = resolvePrice({
    basePrice: row.price,
    priceListPrice: row.price_list_price == null ? null : Number(row.price_list_price),
    scheduledPrices: row.scheduled_price == null ? [] : [{ price: row.scheduled_price, starts_at: row.scheduled_starts_at, ends_at: row.scheduled_ends_at }],
    promotions: explicitOverride == null && Array.isArray(row.promotions) ? row.promotions : [],
    quantity,
    explicitOverride,
  });
  const availableQuantity = row.store_quantity == null ? 0 : Number(row.store_quantity);
  const publicName = String(row.web_shop_title_override || row.name || "").trim() || row.name;
  const publicDescription = String(row.web_shop_description_override || row.description || "").trim() || row.description || "";
  return {
    id: row.id,
    name: publicName,
    description: publicDescription,
    imageUrl: row.web_shop_image_override || row.image_url || null,
    category: row.category_name || null,
    categoryId: row.category_id || null,
    productKind: row.product_kind || "standard",
    variantAttributes: row.variant_attributes || {},
    price: price.unitPrice,
    total: price.total,
    vatRate: row.vat_enabled === false || row.vat_applicable === false ? 0 : Number(row.vat_rate || 0),
    available: row.track_stock !== true || availableQuantity > 0,
    stockAvailable: row.track_stock === true ? Math.max(0, availableQuantity) : null,
    featured: row.web_shop_featured === true,
    deliveryEligible: row.web_shop_delivery_eligible !== false,
    pickupEligible: row.web_shop_pickup_eligible !== false,
  };
}

export function createClientWebShopRouter({
  authenticate,
  authorize,
  db,
  pool,
  createInventoryMovement,
  paymentProvider = createSandboxOnlinePaymentProvider(),
  getCompanyEntitlements = async () => ({}),
}) {
  const router = express.Router();

  async function resolveShop(slug) {
    if (!SLUG_RE.test(String(slug || ""))) return null;
    const result = await db(
      `SELECT c.id AS company_id,c.name AS company_name,c.logo_url,c.currency,
              s.id AS store_id,s.name AS store_name,s.address_line1,s.address_line2,s.city,s.postcode,s.phone,
              cs.client_web_shop_name,cs.client_web_shop_slug,cs.client_web_shop_price_list_id,cs.client_web_shop_pickup_enabled,
              cs.client_web_shop_delivery_enabled,cs.client_web_shop_own_delivery_enabled,cs.client_web_shop_minimum_order,
              cs.client_web_shop_delivery_fee,cs.client_web_shop_guest_checkout,
              cs.client_web_shop_sandbox_payments_enabled,cs.online_payment_methods,
              i.status AS installation_status,p.active AS package_active,delivery_package.id AS own_delivery_package_id,
              delivery_install.id AS own_delivery_installation_id
         FROM company_settings cs
         JOIN companies c ON c.id=cs.company_id AND c.active=true
         JOIN stores s ON s.id=cs.client_web_shop_store_id AND s.company_id=c.id AND s.active=true
         JOIN company_package_installations i ON i.company_id=c.id AND i.status='active' AND i.deactivated_by_user=false
         JOIN package_registry p ON p.id=i.package_id AND p.package_key='client_web_shop' AND p.active=true
         LEFT JOIN package_registry delivery_package ON delivery_package.package_key='own_delivery' AND delivery_package.active=true
         LEFT JOIN company_package_installations delivery_install ON delivery_install.company_id=c.id AND delivery_install.package_id=delivery_package.id AND delivery_install.status='active' AND delivery_install.deactivated_by_user=false
        WHERE LOWER(cs.client_web_shop_slug)=LOWER($1) AND cs.client_web_shop_enabled=true
        LIMIT 1`,
      [slug]
    );
    const row = result.rows[0];
    if (!row) return null;
    const entitlements = await getCompanyEntitlements(row.company_id);
    if (entitlements.client_web_shop !== true && entitlements["package:client_web_shop"] !== true) return null;
    row.client_web_shop_own_delivery_enabled = row.client_web_shop_own_delivery_enabled === true &&
      row.own_delivery_package_id != null && row.own_delivery_installation_id != null && entitlements.delivery === true;
    return row;
  }

  async function authorizeSandboxPayment({ shop, order, idempotencyKey }) {
    const paymentKey = crypto.createHash("sha256").update(`${shop.company_id}:client_web_shop:${idempotencyKey}`).digest("hex");
    let payment = await db(
      `SELECT id,amount,payment_method,status,provider_transaction_id
         FROM payments WHERE company_id=$1 AND idempotency_key=$2`,
      [shop.company_id, paymentKey]
    );
    if (!payment.rows.length) {
      payment = await db(
        `INSERT INTO payments(company_id,store_id,online_order_id,direction,reference,payment_method,amount,provider,status,idempotency_key)
         VALUES($1,$2,$3,'IN',$4,'card',$5,'onepos_sandbox','pending',$6)
         ON CONFLICT(company_id,idempotency_key) DO NOTHING
         RETURNING id,amount,payment_method,status,provider_transaction_id`,
        [shop.company_id, shop.store_id, order.id, order.external_reference, Number(order.total), paymentKey]
      );
      if (!payment.rows.length) {
        payment = await db(
          `SELECT id,amount,payment_method,status,provider_transaction_id
             FROM payments WHERE company_id=$1 AND idempotency_key=$2`,
          [shop.company_id, paymentKey]
        );
      }
    }
    const existing = payment.rows[0];
    if (!existing || Number(existing.amount) !== Number(order.total) || existing.payment_method !== "card") {
      return { success: false, conflict: true };
    }
    if (existing.status === "completed") return { success: true, providerTransactionId: existing.provider_transaction_id };
    if (existing.status === "failed") return { success: false, declined: true };

    let authorization;
    try {
      authorization = await paymentProvider.authorizePayment({
        amount: Number(order.total),
        currency: order.currency || shop.currency || "GBP",
        paymentMethod: "card",
        idempotencyKey: paymentKey,
      });
    } catch (error) {
      authorization = { success: false, status: "failed", failureCode: "provider_error" };
    }
    const succeeded = authorization?.success === true && authorization?.status !== "failed";
    await db(
      `UPDATE payments SET status=$1,provider=$2,provider_transaction_id=$3
        WHERE id=$4 AND company_id=$5 AND idempotency_key=$6`,
      [succeeded ? "completed" : "failed", String(authorization?.provider || paymentProvider.providerKey || "payment_provider"), authorization?.transactionId || null, existing.id, shop.company_id, paymentKey]
    );
    await db(
      "UPDATE online_orders SET payment_status=$1,updated_at=NOW() WHERE id=$2 AND company_id=$3 AND platform=$4",
      [succeeded ? "paid" : "failed", order.id, shop.company_id, SHOP_PLATFORM]
    );
    if (!succeeded) {
      const cancellation = await transitionGenericOrder({
        pool,
        companyId: shop.company_id,
        orderId: order.id,
        userId: null,
        toStatus: "CANCELLED",
        reason: "Online payment declined",
        createInventoryMovement,
      });
      if (!cancellation.success) throw new Error(`Payment failed and order cancellation did not complete: ${cancellation.error}`);
      return { success: false, declined: true };
    }
    return { success: true, providerTransactionId: authorization.transactionId || null };
  }

  router.get("/client-web-shop/public/:slug", async (req, res) => {
    try {
      const shop = await resolveShop(req.params.slug);
      if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });
      const categoryId = req.query.categoryId ? String(req.query.categoryId) : null;
      if (categoryId && !UUID_RE.test(categoryId)) return res.status(400).json({ success: false, message: "Invalid product category" });
      const productsResult = await db(SHOP_PRODUCT_QUERY, [shop.company_id, shop.store_id, String(req.query.q || "").trim().slice(0, 100) || null, categoryId, null, shop.client_web_shop_price_list_id || null]);
      const publicRows = productsResult.rows.filter((row) => row && row.web_shop_published !== false && (row.web_shop_publish_start == null || new Date(row.web_shop_publish_start).getTime() <= Date.now()) && (row.web_shop_publish_end == null || new Date(row.web_shop_publish_end).getTime() > Date.now()));
      const products = publicRows.map((row) => ({
        ...safeProduct(row),
        parentId: row.parent_product_id || null,
      }));
      const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
      res.json({
        success: true,
        data: {
          shop: {
            name: shop.client_web_shop_name || shop.company_name,
            companyName: shop.company_name,
            logoUrl: shop.logo_url || null,
            currency: shop.currency || "GBP",
            storeName: shop.store_name,
            fulfilment: {
              pickup: shop.client_web_shop_pickup_enabled === true,
              delivery: shop.client_web_shop_delivery_enabled === true,
              ownDelivery: shop.client_web_shop_own_delivery_enabled === true,
              deliveryFee: Number(shop.client_web_shop_delivery_fee || 0),
              minimumOrder: Number(shop.client_web_shop_minimum_order || 0),
            },
            guestCheckout: shop.client_web_shop_guest_checkout === true,
            paymentOptions: paymentOptions(shop, await getAllowedPaymentMethodCodes(db, shop.company_id)),
          },
          categories,
          products,
        },
      });
    } catch (error) {
      console.error("Client web shop catalogue error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load shop" });
    }
  });

  router.get("/client-web-shop/public/:slug/products/:productId", async (req, res) => {
    try {
      const shop = await resolveShop(req.params.slug);
      if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });
      const productId = String(req.params.productId || "");
      if (!UUID_RE.test(productId)) return res.status(404).json({ success: false, message: "Product not found" });
      const productResult = await db(SHOP_PRODUCT_QUERY, [shop.company_id, shop.store_id, null, null, [productId], shop.client_web_shop_price_list_id || null]);
      const row = productResult.rows[0];
      if (!row || row.web_shop_published !== true || (row.web_shop_publish_start != null && new Date(row.web_shop_publish_start).getTime() > Date.now()) || (row.web_shop_publish_end != null && new Date(row.web_shop_publish_end).getTime() <= Date.now())) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
      res.json({ success: true, data: { ...safeProduct(row), parentId: row.parent_product_id || null } });
    } catch (error) {
      console.error("Client web shop product detail error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load product" });
    }
  });

  async function issueTrackingToken(companyId, orderId, slug) {
    const stored = await db(
      `SELECT public_tracking_token_hash,public_tracking_token_ciphertext,public_tracking_token_expires_at
         FROM online_orders WHERE id=$1 AND company_id=$2 AND platform=$3`,
      [orderId, companyId, SHOP_PLATFORM]
    );
    let token = stored.rows[0]?.public_tracking_token_ciphertext
      ? decryptSecret(stored.rows[0].public_tracking_token_ciphertext)
      : null;
    if (!token) {
      token = crypto.randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const updated = await db(
        `UPDATE online_orders SET public_tracking_token_hash=$1,public_tracking_token_ciphertext=$2,
                public_tracking_token_expires_at=$3,updated_at=NOW()
          WHERE id=$4 AND company_id=$5 AND platform=$6 AND public_tracking_token_hash IS NULL
          RETURNING id`,
        [hashToken(token), encryptSecret(token), expiresAt, orderId, companyId, SHOP_PLATFORM]
      );
      if (!updated.rows.length) {
        const current = await db("SELECT public_tracking_token_ciphertext FROM online_orders WHERE id=$1 AND company_id=$2 AND platform=$3", [orderId, companyId, SHOP_PLATFORM]);
        token = decryptSecret(current.rows[0]?.public_tracking_token_ciphertext);
      }
    }
    if (!token) throw new Error("Unable to issue order tracking access");
    return `/shop/${encodeURIComponent(slug)}/track/${encodeURIComponent(token)}`;
  }

  router.get("/client-web-shop/public/:slug/orders/tracking/:token", async (req, res) => {
    try {
      const shop = await resolveShop(req.params.slug);
      if (!shop) return res.status(404).json({ success: false, message: "Order not found" });
      const order = await db(
        `SELECT external_reference,fulfilment_type,status,created_at,ready_at,completed_at,cancelled_at
           FROM online_orders
          WHERE company_id=$1 AND platform=$2 AND public_tracking_token_hash=$3
            AND public_tracking_token_expires_at>NOW()`,
        [shop.company_id, SHOP_PLATFORM, hashToken(req.params.token)]
      );
      if (!order.rows.length) return res.status(404).json({ success: false, message: "Order not found" });
      const row = order.rows[0];
      const status = row.status === "COMPLETED"
        ? (row.fulfilment_type !== "SELF_PICKUP" ? "DELIVERED" : "COLLECTED")
        : row.status;
      res.json({ success: true, data: {
        reference: row.external_reference,
        fulfilmentType: row.fulfilment_type,
        status,
        createdAt: row.created_at,
        readyAt: row.ready_at,
        completedAt: row.completed_at,
        cancelledAt: row.cancelled_at,
      } });
    } catch (error) {
      console.error("Public order tracking error:", error?.message || error);
      res.status(500).json({ success: false, message: "Unable to load order status" });
    }
  });

  router.post("/client-web-shop/public/:slug/quote", async (req, res) => {
    try {
      const shop = await resolveShop(req.params.slug);
      if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });
      const fulfilmentType = String(req.body?.fulfilmentType || (shop.client_web_shop_pickup_enabled ? "SELF_PICKUP" : "DELIVERY")).toUpperCase();
      if (fulfilmentType === "DELIVERY" && shop.client_web_shop_delivery_enabled !== true) return res.status(400).json({ success: false, message: "Delivery is not available" });
      if (fulfilmentType === "SELF_PICKUP" && shop.client_web_shop_pickup_enabled !== true) return res.status(400).json({ success: false, message: "Pickup is not available" });
      if (!new Set(["DELIVERY", "SELF_PICKUP"]).has(fulfilmentType)) return res.status(400).json({ success: false, message: "Invalid fulfilment type" });
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length || items.length > 50) return res.status(400).json({ success: false, message: "Select between 1 and 50 products" });
      const quantities = new Map();
      for (const item of items) {
        const productId = String(item.productId || "");
        const quantity = Number(item.quantity);
        if (!productId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 99) {
          return res.status(400).json({ success: false, message: "Product quantities must be between 1 and 99" });
        }
        const combinedQuantity = (quantities.get(productId) || 0) + quantity;
        if (combinedQuantity > 99) return res.status(400).json({ success: false, message: "Product quantities cannot exceed 99" });
        quantities.set(productId, combinedQuantity);
      }
      const ids = [...quantities.keys()];
      const result = await db(SHOP_PRODUCT_QUERY, [shop.company_id, shop.store_id, null, null, ids, shop.client_web_shop_price_list_id || null]);
      if (result.rows.length !== ids.length) return res.status(409).json({ success: false, message: "A product is unavailable" });
      const lines = result.rows.map((row) => {
        const product = safeProduct(row, quantities.get(row.id));
        if (!product.available || (product.stockAvailable !== null && product.stockAvailable < quantities.get(row.id))) {
          throw Object.assign(new Error(`${product.name} is unavailable in the requested quantity`), { status: 409 });
        }
        return {
          productId: product.id,
          name: product.name,
          quantity: quantities.get(row.id),
          unitPrice: product.price,
          subtotal: product.total,
          tax: Math.round(product.total * product.vatRate) / 100,
          total: product.total + Math.round(product.total * product.vatRate) / 100,
          vatRate: product.vatRate,
        };
      });
      const subtotal = Math.round(lines.reduce((sum, line) => sum + line.subtotal, 0) * 100) / 100;
      const tax = Math.round(lines.reduce((sum, line) => sum + line.tax, 0) * 100) / 100;
      if (subtotal < Number(shop.client_web_shop_minimum_order || 0)) {
        return res.status(400).json({ success: false, code: "MINIMUM_ORDER", message: `Minimum order is ${Number(shop.client_web_shop_minimum_order).toFixed(2)}` });
      }
      const deliveryFee = fulfilmentType === "DELIVERY" ? Number(shop.client_web_shop_delivery_fee || 0) : 0;
      res.json({ success: true, data: { lines, subtotal, tax, deliveryFee, total: Math.round((subtotal + tax + deliveryFee) * 100) / 100 } });
    } catch (error) {
      const status = error.status || 500;
      if (status === 500) console.error("Client web shop quote error:", error?.message || error);
      res.status(status).json({ success: false, message: status === 500 ? "Unable to calculate basket" : error.message });
    }
  });

  router.post("/client-web-shop/public/:slug/orders", async (req, res) => {
    try {
      const shop = await resolveShop(req.params.slug);
      if (!shop) return res.status(404).json({ success: false, message: "Shop not found" });
      const fulfilmentType = String(req.body?.fulfilmentType || "").toUpperCase();
      if (fulfilmentType === "DELIVERY" && shop.client_web_shop_delivery_enabled !== true) {
        return res.status(400).json({ success: false, message: "Delivery is not available" });
      }
      if (fulfilmentType === "SELF_PICKUP" && shop.client_web_shop_pickup_enabled !== true) {
        return res.status(400).json({ success: false, message: "Pickup is not available" });
      }
      const orderFulfilmentType = fulfilmentType === "DELIVERY" && shop.client_web_shop_own_delivery_enabled === true ? "OWN_DELIVERY" : fulfilmentType;
      const customer = req.body?.customer || {};
      const name = String(customer.name || "").trim().slice(0, 200);
      const phone = String(customer.phone || "").trim().slice(0, 50);
      const email = String(customer.email || "").trim().slice(0, 255);
      const address = customer.address && typeof customer.address === "object"
        ? [customer.address.line1, customer.address.line2, customer.address.city, customer.address.postcode].map((value) => String(value || "").trim()).filter(Boolean).join(", ")
        : String(customer.address || "").trim();
      if (!name || !phone || (fulfilmentType === "DELIVERY" && !address)) {
        return res.status(400).json({ success: false, message: "Name, phone and a delivery address are required" });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, message: "Enter a valid email address" });
      }
      if (!Array.isArray(req.body?.items) || !req.body.items.length || req.body.items.length > 50) {
        return res.status(400).json({ success: false, message: "Select between 1 and 50 products" });
      }
      const quantities = new Map();
      for (const item of req.body.items) {
        const productId = String(item.productId || "");
        const quantity = Number(item.quantity);
        if (!productId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 99) {
          return res.status(400).json({ success: false, message: "Product quantities must be between 1 and 99" });
        }
        const combinedQuantity = (quantities.get(productId) || 0) + quantity;
        if (combinedQuantity > 99) return res.status(400).json({ success: false, message: "Product quantities cannot exceed 99" });
        quantities.set(productId, combinedQuantity);
      }
      const productRows = await db(SHOP_PRODUCT_QUERY, [shop.company_id, shop.store_id, null, null, [...quantities.keys()], shop.client_web_shop_price_list_id || null]);
      if (productRows.rows.length !== quantities.size) return res.status(409).json({ success: false, message: "A product is unavailable" });
      const quotedSubtotal = productRows.rows.reduce((sum, row) => {
        const product = safeProduct(row, quantities.get(row.id));
        if (!product.available || (product.stockAvailable !== null && product.stockAvailable < quantities.get(row.id))) {
          throw Object.assign(new Error(`${product.name} is unavailable in the requested quantity`), { status: 409 });
        }
        return sum + product.total;
      }, 0);
      if (quotedSubtotal < Number(shop.client_web_shop_minimum_order || 0)) {
        return res.status(400).json({ success: false, code: "MINIMUM_ORDER", message: `Minimum order is ${Number(shop.client_web_shop_minimum_order).toFixed(2)}` });
      }
      const idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
      if (idempotencyKey.length < 16 || idempotencyKey.length > 200) {
        return res.status(400).json({ success: false, message: "A valid idempotency key is required" });
      }
      const methods = paymentOptions(shop, await getAllowedPaymentMethodCodes(db, shop.company_id));
      const paymentMethod = String(req.body?.paymentMethod || (fulfilmentType === "DELIVERY" ? "cod" : "cash")).toLowerCase();
      const selectedMethod = methods.find((method) => method.code === paymentMethod);
      if (!selectedMethod || (selectedMethod.fulfilmentType !== "ANY" && selectedMethod.fulfilmentType !== fulfilmentType)) {
        return res.status(400).json({ success: false, message: "The selected payment method is not available for this fulfilment type" });
      }
      const externalOrderId = crypto.createHash("sha256").update(`${shop.company_id}:${idempotencyKey}`).digest("hex");
      const result = await createGenericOrder({
        db,
        pool,
        companyId: shop.company_id,
        userId: null,
        storeId: shop.store_id,
        externalOrderId,
        fulfilmentType: orderFulfilmentType,
        items: req.body.items.map(({ productId, quantity }) => ({ productId: String(productId || ""), quantity })),
        customer: { name, phone, email: email || null, address: address || null },
        notes: String(req.body?.notes || "").trim().slice(0, 1000),
        payment: { method: paymentMethod === "sandbox_card" ? "card" : paymentMethod, status: "pending" },
        platform: SHOP_PLATFORM,
        priceListId: shop.client_web_shop_price_list_id || null,
        deliveryFee: fulfilmentType === "DELIVERY" ? Number(shop.client_web_shop_delivery_fee || 0) : 0,
        minimumSubtotal: Number(shop.client_web_shop_minimum_order || 0),
        createInventoryMovement,
      });
      let order = result.order;
      if (result.duplicate) {
        const existing = await db(
          `SELECT id,external_reference,total,status,fulfilment_type,payment_status,currency
             FROM online_orders WHERE id=$1 AND company_id=$2 AND platform=$3`,
          [result.orderId, shop.company_id, SHOP_PLATFORM]
        );
        const row = existing.rows[0];
        if (!row) return res.status(404).json({ success: false, message: "Order not found" });
        order = row;
      }
      if (paymentMethod === "sandbox_card") {
        const authorization = await authorizeSandboxPayment({ shop, order, idempotencyKey });
        if (authorization.conflict) return res.status(409).json({ success: false, message: "Payment request conflicts with an existing attempt" });
        if (!authorization.success) return res.status(402).json({ success: false, code: "PAYMENT_FAILED", message: "Payment was not approved. Choose another payment method or try again." });
      }
      const trackingPath = await issueTrackingToken(shop.company_id, order.id, req.params.slug);
      res.status(result.duplicate ? 200 : 201).json({
        success: true,
        duplicate: result.duplicate === true,
        data: {
          reference: order.external_reference,
          total: Number(order.total),
          status: order.status,
          fulfilmentType: order.fulfilment_type || orderFulfilmentType,
          paymentStatus: paymentMethod === "sandbox_card" ? "paid" : "pending",
          trackingPath,
        },
      });
    } catch (error) {
      const status = error.status || (/Payment failed and order cancellation did not complete/i.test(error.message || "")
        ? 500
        : /not found|not owned|invalid|quantity|stock|Insufficient/i.test(error.message || "") ? 400 : 500);
      console.error("Client web shop order error:", error?.message || error);
      res.status(status).json({ success: false, message: status === 400 ? error.message : "Unable to submit order" });
    }
  });

  router.get("/settings/client-web-shop", authenticate, authorize("settings.manage"), async (req, res) => {
    try {
      const result = await db(
        `SELECT client_web_shop_enabled,client_web_shop_slug,client_web_shop_name,client_web_shop_store_id,client_web_shop_price_list_id,
          client_web_shop_pickup_enabled,client_web_shop_delivery_enabled,client_web_shop_own_delivery_enabled,client_web_shop_minimum_order,
          client_web_shop_delivery_fee,client_web_shop_guest_checkout,client_web_shop_sandbox_payments_enabled
           FROM company_settings WHERE company_id=$1`,
        [req.user.companyId]
      );
      const [stores, priceLists] = await Promise.all([
        db("SELECT id,name FROM stores WHERE company_id=$1 AND active=true ORDER BY name", [req.user.companyId]),
        db("SELECT id,name FROM price_lists WHERE company_id=$1 AND active=true ORDER BY name", [req.user.companyId]),
      ]);
      res.json({ success: true, data: { ...(result.rows[0] || {}), stores: stores.rows, priceLists: priceLists.rows } });
    } catch (error) {
      res.status(500).json({ success: false, message: "Unable to load shop settings" });
    }
  });

  router.put("/settings/client-web-shop", authenticate, authorize("settings.manage"), async (req, res) => {
    const body = req.body || {};
    const slug = String(body.slug || "").trim().toLowerCase();
    const storeId = String(body.storeId || "").trim();
    const priceListId = String(body.priceListId || "").trim() || null;
    const deliveryFee = Number(body.deliveryFee || 0);
    const minimumOrder = Number(body.minimumOrder || 0);
    if (!SLUG_RE.test(slug) || !storeId || (priceListId && !UUID_RE.test(priceListId)) || !Number.isFinite(deliveryFee) || deliveryFee < 0 || !Number.isFinite(minimumOrder) || minimumOrder < 0 || (body.pickupEnabled === false && body.deliveryEnabled !== true) || (body.ownDeliveryEnabled === true && body.deliveryEnabled !== true)) {
      return res.status(400).json({ success: false, message: "Provide a valid slug, store, minimum order and delivery charge" });
    }
    try {
      const store = await db("SELECT id FROM stores WHERE id=$1 AND company_id=$2 AND active=true", [storeId, req.user.companyId]);
      if (!store.rows.length) return res.status(400).json({ success: false, message: "Store is not active in this company" });
      if (priceListId) {
        const priceList = await db("SELECT id FROM price_lists WHERE id=$1 AND company_id=$2 AND active=true", [priceListId, req.user.companyId]);
        if (!priceList.rows.length) return res.status(400).json({ success: false, message: "Price list is not active in this company" });
      }
      await db(
        `INSERT INTO company_settings (
          company_id,client_web_shop_enabled,client_web_shop_slug,client_web_shop_name,client_web_shop_store_id,client_web_shop_price_list_id,
          client_web_shop_pickup_enabled,client_web_shop_delivery_enabled,client_web_shop_own_delivery_enabled,client_web_shop_minimum_order,
          client_web_shop_delivery_fee,client_web_shop_guest_checkout,client_web_shop_sandbox_payments_enabled,updated_by,updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,NOW())
        ON CONFLICT(company_id) DO UPDATE SET client_web_shop_enabled=EXCLUDED.client_web_shop_enabled,
          client_web_shop_slug=EXCLUDED.client_web_shop_slug,client_web_shop_name=EXCLUDED.client_web_shop_name,
          client_web_shop_store_id=EXCLUDED.client_web_shop_store_id,
          client_web_shop_price_list_id=EXCLUDED.client_web_shop_price_list_id,
          client_web_shop_pickup_enabled=EXCLUDED.client_web_shop_pickup_enabled,
          client_web_shop_delivery_enabled=EXCLUDED.client_web_shop_delivery_enabled,
          client_web_shop_own_delivery_enabled=EXCLUDED.client_web_shop_own_delivery_enabled,
          client_web_shop_minimum_order=EXCLUDED.client_web_shop_minimum_order,
          client_web_shop_delivery_fee=EXCLUDED.client_web_shop_delivery_fee,
          client_web_shop_sandbox_payments_enabled=EXCLUDED.client_web_shop_sandbox_payments_enabled,
          client_web_shop_guest_checkout=true,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [req.user.companyId, body.enabled === true, slug, String(body.name || "").trim().slice(0, 200) || null, storeId, priceListId,
          body.pickupEnabled !== false, body.deliveryEnabled === true, body.ownDeliveryEnabled === true, minimumOrder, deliveryFee, body.sandboxPaymentsEnabled === true, req.user.id]
      );
      res.json({ success: true, data: { enabled: body.enabled === true, slug, path: `/shop/${slug}` } });
    } catch (error) {
      const conflict = error.code === "23505";
      res.status(conflict ? 409 : 500).json({ success: false, message: conflict ? "That shop URL is already in use" : "Unable to save shop settings" });
    }
  });

  return router;
}