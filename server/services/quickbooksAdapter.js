import { createHash } from "node:crypto";

const OAUTH_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const API_BASE_URLS = Object.freeze({
  production: "https://quickbooks.api.intuit.com",
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
});

function requiredString(value, name) {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${name} is required`);
  return result;
}

export function quickBooksRequestId(companyId, entityType, sourceId) {
  const identity = `${requiredString(companyId, "Company ID")}:${requiredString(entityType, "Entity type")}:${requiredString(sourceId, "Source ID")}`;
  return createHash("sha256").update(identity).digest("hex").slice(0, 40);
}

async function readJson(response, provider, operation) {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error(`${provider} ${operation} failed (${response.status})`);
  if (!body || typeof body !== "object") throw new Error(`${provider} returned an invalid response`);
  return body;
}

export function createQuickBooksAdapter({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  async function requestToken(form, { clientId, clientSecret }) {
    const id = requiredString(clientId, "QuickBooks client ID");
    const secret = requiredString(clientSecret, "QuickBooks client secret");
    let response;
    try {
      response = await fetchImpl(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(form),
      });
    } catch {
      throw new Error("QuickBooks OAuth request failed");
    }
    const tokens = await readJson(response, "QuickBooks", "OAuth request");
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(Number(tokens.expires_in))) {
      throw new Error("QuickBooks returned incomplete OAuth credentials");
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: Number(tokens.expires_in),
      tokenType: tokens.token_type || "bearer",
    };
  }

  async function exchangeAuthorizationCode({ code, redirectUri, realmId, clientId, clientSecret }) {
    const result = await requestToken({
      grant_type: "authorization_code",
      code: requiredString(code, "QuickBooks authorization code"),
      redirect_uri: requiredString(redirectUri, "QuickBooks redirect URI"),
    }, { clientId, clientSecret });
    return { ...result, realmId: requiredString(realmId, "QuickBooks company ID") };
  }

  async function refreshAuthentication({ refreshToken, clientId, clientSecret }) {
    return requestToken({
      grant_type: "refresh_token",
      refresh_token: requiredString(refreshToken, "QuickBooks refresh token"),
    }, { clientId, clientSecret });
  }

  async function apiRequest({ environment, realmId, accessToken, path, method = "GET", body }) {
    const baseUrl = API_BASE_URLS[environment];
    if (!baseUrl) throw new Error("QuickBooks environment must be production or sandbox");
    const companyId = requiredString(realmId, "QuickBooks company ID");
    if (!/^\d+$/.test(companyId)) throw new Error("QuickBooks company ID is invalid");
    const apiPath = String(path || "");
    if (!apiPath.startsWith(`/v3/company/${companyId}/`) || apiPath.includes("..")) {
      throw new Error("QuickBooks API path is invalid");
    }
    const token = requiredString(accessToken, "QuickBooks access token");
    let response;
    try {
      response = await fetchImpl(`${baseUrl}${apiPath}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new Error("QuickBooks API request failed");
    }
    return readJson(response, "QuickBooks", "API request");
  }

  async function entityRequest({ environment, realmId, accessToken, resource, method = "GET", body, query = null, requestId = null }) {
    const companyId = requiredString(realmId, "QuickBooks company ID");
    if (!/^\d+$/.test(companyId)) throw new Error("QuickBooks company ID is invalid");
    const params = new URLSearchParams();
    if (query) params.set("query", String(query));
    if (requestId) params.set("requestid", String(requestId).slice(0, 50));
    const suffix = params.size ? `?${params}` : "";
    const resourceName = String(resource || "").trim();
    const path = resourceName === "query"
      ? `/v3/company/${companyId}/query${suffix}`
      : `/v3/company/${companyId}/${resourceName}${suffix}`;
    return apiRequest({ environment, realmId: companyId, accessToken, path, method, body });
  }

  async function upsertListEntity({ connection, entityType, resource, body, externalId = null, syncToken = null, sourceId }) {
    const requestId = quickBooksRequestId(connection.companyId || connection.realmId, entityType, sourceId || externalId || "new");
    if (externalId) {
      if (!syncToken) throw new Error("QuickBooks SyncToken is required to update a mapped entity");
      return (await entityRequest({ ...connection, resource, method: "POST", body: { ...body, Id: String(externalId), SyncToken: String(syncToken), sparse: true }, requestId }))[resource] || (await entityRequest({ ...connection, resource, method: "POST", body: { ...body, Id: String(externalId), SyncToken: String(syncToken), sparse: true }, requestId }));
    }
    return (await entityRequest({ ...connection, resource, method: "POST", body, requestId }))[resource] || (await entityRequest({ ...connection, resource, method: "POST", body, requestId }));
  }

  async function syncCustomer({ connection, customer, externalId = null, syncToken = null, sourceId = customer?.id }) {
    const name = requiredString(customer?.name, "Customer name");
    const body = { DisplayName: String(name).slice(0, 100) };
    const email = String(customer?.email || "").trim();
    const phone = String(customer?.phone || "").trim();
    const address = String(customer?.address || "").trim();
    if (email) body.PrimaryEmailAddr = { Address: email };
    if (phone) body.PrimaryPhone = { FreeFormNumber: phone };
    if (address) body.BillAddr = { Line1: address.slice(0, 500) };
    return upsertListEntity({ connection, entityType: "customer", resource: "Customer", body, externalId, syncToken, sourceId });
  }

  async function syncVendor({ connection, supplier, externalId = null, syncToken = null, sourceId = supplier?.id }) {
    const name = requiredString(supplier?.name, "Supplier name");
    const body = { DisplayName: String(name).slice(0, 100) };
    const email = String(supplier?.email || "").trim();
    const phone = String(supplier?.phone || "").trim();
    const address = String(supplier?.address || "").trim();
    if (email) body.PrimaryEmailAddr = { Address: email };
    if (phone) body.PrimaryPhone = { FreeFormNumber: phone };
    if (address) body.BillAddr = { Line1: address.slice(0, 500) };
    return upsertListEntity({ connection, entityType: "supplier", resource: "Vendor", body, externalId, syncToken, sourceId });
  }

  async function syncItem({ connection, product, externalId = null, syncToken = null, incomeAccountId, taxCodeId = null, sourceId = product?.id }) {
    const name = requiredString(product?.name, "Product name");
    const accountId = requiredString(incomeAccountId, "Sales income account mapping");
    const body = {
      Name: String(product.sku || name).slice(0, 100),
      Description: String(product.description || name).slice(0, 4000),
      Type: "NonInventory",
      IncomeAccountRef: { value: accountId },
      UnitPrice: Number(product.price ?? product.unitPrice ?? 0),
    };
    if (!Number.isFinite(body.UnitPrice) || body.UnitPrice < 0) throw new Error("Product price is invalid");
    if (taxCodeId) body.SalesTaxCodeRef = { value: String(taxCodeId) };
    return upsertListEntity({ connection, entityType: "product", resource: "Item", body, externalId, syncToken, sourceId });
  }

  function transactionLines(lines, mappings = {}) {
    if (!Array.isArray(lines) || !lines.length) throw new Error("QuickBooks transaction requires at least one line");
    return lines.map((line) => {
      const quantity = Number(line.quantity);
      const amount = Number(line.amount ?? ((Number(line.unitPrice) || 0) * quantity));
      const itemId = requiredString(line.itemId || line.externalItemId || line.item_ref, "QuickBooks item mapping");
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount < 0) {
        throw new Error("QuickBooks transaction line amount or quantity is invalid");
      }
      const detail = { ItemRef: { value: itemId }, Qty: quantity, UnitPrice: amount / quantity };
      const taxCodeId = line.taxCodeId || mappings.taxCodeId;
      if (taxCodeId) detail.TaxCodeRef = { value: String(taxCodeId) };
      return {
        Amount: amount,
        DetailType: "SalesItemLineDetail",
        SalesItemLineDetail: detail,
        ...(line.description ? { Description: String(line.description).slice(0, 4000) } : {}),
      };
    });
  }

  async function exportSale({ connection, documentType = "SalesReceipt", customerId, lines, transactionDate, reference, paymentMethodId, mappings = {}, sourceId }) {
    if (!["Invoice", "SalesReceipt"].includes(documentType)) throw new Error("QuickBooks sales document type is invalid");
    const customer = requiredString(customerId, "QuickBooks customer mapping");
    const body = {
      CustomerRef: { value: customer },
      Line: transactionLines(lines, mappings),
      TxnDate: String(transactionDate || new Date().toISOString().slice(0, 10)),
      ...(reference ? { DocNumber: String(reference).slice(0, 21) } : {}),
      ...(paymentMethodId ? { PaymentMethodRef: { value: String(paymentMethodId) } } : {}),
    };
    const requestId = quickBooksRequestId(connection.companyId || connection.realmId, documentType.toLowerCase(), sourceId || reference || "sale");
    return (await entityRequest({ ...connection, resource: documentType, method: "POST", body, requestId }))[documentType] || (await entityRequest({ ...connection, resource: documentType, method: "POST", body, requestId }));
  }

  function purchaseLines(lines, mappings = {}, detailType = "ItemBasedExpenseLineDetail") {
    if (!Array.isArray(lines) || !lines.length) throw new Error("QuickBooks purchase transaction requires at least one line");
    return lines.map((line) => {
      const quantity = Number(line.quantity);
      const amount = Number(line.amount ?? ((Number(line.unitPrice) || 0) * quantity));
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount < 0) {
        throw new Error("QuickBooks purchase line amount or quantity is invalid");
      }
      const taxCodeId = line.taxCodeId || mappings.taxCodeId || mappings.vatCodeId;
      const itemId = line.itemId || line.externalItemId || line.item_ref;
      const accountId = line.accountId || mappings.expenseAccountId || mappings.purchaseAccountId;
      const detail = detailType === "AccountBasedExpenseLineDetail"
        ? {
            AccountRef: { value: requiredString(accountId, "QuickBooks purchase account mapping") },
            ...(taxCodeId ? { TaxCodeRef: { value: String(taxCodeId) } } : {}),
          }
        : {
            ItemRef: { value: requiredString(itemId, "QuickBooks item mapping") },
            Qty: quantity,
            UnitPrice: amount / quantity,
            ...(taxCodeId ? { TaxCodeRef: { value: String(taxCodeId) } } : {}),
          };
      return {
        Amount: amount,
        DetailType: detailType,
        [detailType]: detail,
        ...(line.description ? { Description: String(line.description).slice(0, 4000) } : {}),
      };
    });
  }

  async function exportPurchase({ connection, vendorId, lines, transactionDate, dueDate, reference, mappings = {}, sourceId }) {
    const body = {
      VendorRef: { value: requiredString(vendorId, "QuickBooks vendor mapping") },
      Line: purchaseLines(lines, mappings, mappings.expenseAccountId && mappings.useExpenseLines ? "AccountBasedExpenseLineDetail" : "ItemBasedExpenseLineDetail"),
      TxnDate: String(transactionDate || new Date().toISOString().slice(0, 10)),
      ...(dueDate ? { DueDate: String(dueDate) } : {}),
      ...(reference ? { DocNumber: String(reference).slice(0, 21) } : {}),
      ...(mappings.accountsPayableAccountId || mappings.apAccountId
        ? { APAccountRef: { value: String(mappings.accountsPayableAccountId || mappings.apAccountId) } }
        : {}),
    };
    const requestId = quickBooksRequestId(connection.companyId || connection.realmId, "purchase", sourceId || reference || "purchase");
    return (await entityRequest({ ...connection, resource: "Bill", method: "POST", body, requestId })).Bill || (await entityRequest({ ...connection, resource: "Bill", method: "POST", body, requestId }));
  }

  async function syncPayment({ connection, customerId, total, paymentMethodId, depositToAccountId, linkedTransactionId, sourceId }) {
    const amount = Number(total);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("QuickBooks payment amount is invalid");
    const body = {
      CustomerRef: { value: requiredString(customerId, "QuickBooks customer mapping") },
      TotalAmt: amount,
      ...(paymentMethodId ? { PaymentMethodRef: { value: String(paymentMethodId) } } : {}),
      ...(depositToAccountId ? { DepositToAccountRef: { value: String(depositToAccountId) } } : {}),
      ...(linkedTransactionId ? { Line: [{ Amount: amount, LinkedTxn: [{ TxnId: String(linkedTransactionId), TxnType: "Invoice" }] }] } : {}),
    };
    const requestId = quickBooksRequestId(connection.companyId || connection.realmId, "payment", sourceId || linkedTransactionId || "payment");
    return (await entityRequest({ ...connection, resource: "Payment", method: "POST", body, requestId }))["Payment"] || (await entityRequest({ ...connection, resource: "Payment", method: "POST", body, requestId }));
  }

  async function exportSupplierPayment({ connection, vendorId, amount, paymentDate, paymentAccountId, allocations = [], reference, sourceId }) {
    const total = Number(amount);
    if (!Number.isFinite(total) || total <= 0) throw new Error("QuickBooks supplier payment amount is invalid");
    const body = {
      VendorRef: { value: requiredString(vendorId, "QuickBooks vendor mapping") },
      TotalAmt: total,
      TxnDate: String(paymentDate || new Date().toISOString().slice(0, 10)),
      ...(paymentAccountId ? { CheckPayment: { BankAccountRef: { value: String(paymentAccountId) } }, PayType: "Check" } : {}),
      ...(reference ? { PrivateNote: String(reference).slice(0, 4000) } : {}),
    };
    if (Array.isArray(allocations) && allocations.length) {
      body.Line = allocations.map((allocation) => ({
        Amount: Number(allocation.amount),
        LinkedTxn: [{ TxnId: requiredString(allocation.externalId || allocation.invoiceExternalId, "QuickBooks bill mapping"), TxnType: "Bill" }],
      }));
    }
    const requestId = quickBooksRequestId(connection.companyId || connection.realmId, "supplier_payment", sourceId || reference || "payment");
    return (await entityRequest({ ...connection, resource: "BillPayment", method: "POST", body, requestId })).BillPayment || (await entityRequest({ ...connection, resource: "BillPayment", method: "POST", body, requestId }));
  }

  async function exportCreditMemo({ connection, customerId, lines, transactionDate, reference, mappings = {}, sourceId }) {
    const body = {
      CustomerRef: { value: requiredString(customerId, "QuickBooks customer mapping") },
      Line: transactionLines(lines, mappings),
      TxnDate: String(transactionDate || new Date().toISOString().slice(0, 10)),
      ...(reference ? { DocNumber: String(reference).slice(0, 21) } : {}),
    };
    const requestId = quickBooksRequestId(connection.companyId || connection.realmId, "credit_memo", sourceId || reference || "credit");
    return (await entityRequest({ ...connection, resource: "CreditMemo", method: "POST", body, requestId }))["CreditMemo"] || (await entityRequest({ ...connection, resource: "CreditMemo", method: "POST", body, requestId }));
  }

  async function exportVendorCredit({ connection, vendorId, lines, transactionDate, reference, mappings = {}, sourceId }) {
    const body = {
      VendorRef: { value: requiredString(vendorId, "QuickBooks vendor mapping") },
      Line: purchaseLines(lines, mappings, mappings.expenseAccountId && mappings.useExpenseLines ? "AccountBasedExpenseLineDetail" : "ItemBasedExpenseLineDetail"),
      TxnDate: String(transactionDate || new Date().toISOString().slice(0, 10)),
      ...(reference ? { DocNumber: String(reference).slice(0, 21) } : {}),
      ...(mappings.accountsPayableAccountId || mappings.apAccountId
        ? { APAccountRef: { value: String(mappings.accountsPayableAccountId || mappings.apAccountId) } }
        : {}),
    };
    const requestId = quickBooksRequestId(connection.companyId || connection.realmId, "vendor_credit", sourceId || reference || "credit");
    return (await entityRequest({ ...connection, resource: "VendorCredit", method: "POST", body, requestId })).VendorCredit || (await entityRequest({ ...connection, resource: "VendorCredit", method: "POST", body, requestId }));
  }

  async function fetchReferenceData(connection, resource, query = null) {
    const supported = new Set(["Account", "TaxCode", "TaxRate", "PaymentMethod", "Item", "Customer", "Vendor"]);
    if (!supported.has(resource)) throw new Error("QuickBooks reference resource is not supported");
    const statement = query || `select * from ${resource} where Active = true maxresults 1000`;
    const result = await entityRequest({ ...connection, resource: "query", method: "POST", query: statement });
    return result.QueryResponse?.[resource] || [];
  }

  async function testConnection(connection) {
    const companyId = requiredString(connection?.realmId, "QuickBooks company ID");
    const body = await apiRequest({
      ...connection,
      path: `/v3/company/${companyId}/companyinfo/${companyId}`,
    });
    const company = body?.CompanyInfo;
    if (!company) throw new Error("QuickBooks company information was not returned");
    return { connected: true, companyId, companyName: String(company.CompanyName || "") };
  }

  return Object.freeze({
    exchangeAuthorizationCode,
    refreshAuthentication,
    apiRequest,
    entityRequest,
    syncCustomer,
    syncVendor,
    syncItem,
    exportSale,
    exportPurchase,
    syncPayment,
    exportSupplierPayment,
    exportCreditMemo,
    exportVendorCredit,
    fetchReferenceData,
    testConnection,
  });
}