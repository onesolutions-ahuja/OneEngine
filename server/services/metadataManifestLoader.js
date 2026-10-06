import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestDirectory = fileURLToPath(new URL("../metadata/manifests/", import.meta.url));
let cache = null;

const SALES_LEGACY_OBJECTS = new Set(["sale", "sale_item", "payment", "refund"]);

const OBJECT_ALIASES = new Map([
  ["till_session", "device_session"],
  ["cash_movement", "cash_ledger"],
  ["purchase", "purchase_ledger"],
  ["purchase_line", "purchase_ledger"],
  ["purchase_receipt", "purchase_ledger"],
  ["supplier_invoice", "purchase_ledger"],
  ["supplier_payment", "purchase_ledger"],
  ["inventory_movement", "inventory_ledger"],
  ["online_order", "salesorder"],
  ["online_order_line", "salesorder"],
]);

const REMOVED_OBJECTS = new Set([
  "appointment",
  "appointment_booking_case",
  "loyalty_configuration",
  "loyalty_account",
  "loyalty_activity",
  "loyalty_adjustment",
  "gift_card_activity",
]);

function canonicalObjectKey(value) {
  const key = String(value || "");
  if (SALES_LEGACY_OBJECTS.has(key)) return "sale_ledger";
  return OBJECT_ALIASES.get(key) || key;
}

function rewriteCanonicalObjectReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteCanonicalObjectReferences);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (["objectKey", "relatedObjectKey", "parentObjectKey", "childObjectKey"].includes(key) && typeof item === "string") {
      next[key] = canonicalObjectKey(item);
    } else {
      next[key] = rewriteCanonicalObjectReferences(item);
    }
  }
  return next;
}

function collapseObjectFamily(objects, keys, canonicalKey, label, sourceTable) {
  const family = objects.filter((object) => keys.has(object?.objectKey));
  if (!family.length) return null;
  const base = family[0];
  const fields = [];
  const seen = new Set();
  for (const object of family) {
    for (const field of Array.isArray(object.fields) ? object.fields : []) {
      const apiName = String(field?.apiName || field?.api_name || "");
      if (!apiName || seen.has(apiName)) continue;
      seen.add(apiName);
      fields.push(rewriteCanonicalObjectReferences(field));
    }
  }
  for (const field of [
    { apiName: "source_record_type", label: "Source Record Type", fieldType: "text", sourceColumn: "source_record_type", writable: true },
    { apiName: "transaction_id", label: "Transaction ID", fieldType: "text", sourceColumn: "transaction_id", writable: true },
  ]) {
    if (!seen.has(field.apiName)) fields.push(field);
  }
  return rewriteCanonicalObjectReferences({
    ...base,
    objectKey: canonicalKey,
    label,
    pluralLabel: label,
    sourceTable,
    fields,
  });
}

function canonicalizeObjectFamilies(manifest) {
  const source = manifest && typeof manifest === "object" ? manifest : {};
  const objects = Array.isArray(source.objects) ? source.objects : [];
  const excluded = new Set([...REMOVED_OBJECTS]);

  const device = collapseObjectFamily(objects, new Set(["till_session"]), "device_session", "Device Session", "device_sessions");
  const cash = collapseObjectFamily(objects, new Set(["cash_movement"]), "cash_ledger", "Cash Ledger", "cash_ledger");
  const purchasing = collapseObjectFamily(
    objects,
    new Set(["purchase", "purchase_line", "purchase_receipt", "supplier_invoice", "supplier_payment"]),
    "purchase_ledger",
    "Purchase Ledger",
    "purchase_ledger"
  );
  const inventory = collapseObjectFamily(objects, new Set(["inventory_movement"]), "inventory_ledger", "Inventory Ledger", "inventory_ledger");
  const orders = collapseObjectFamily(objects, new Set(["online_order", "online_order_line"]), "salesorder", "Sales Order", "salesorder");

  for (const key of OBJECT_ALIASES.keys()) excluded.add(key);
  for (const key of SALES_LEGACY_OBJECTS) excluded.add(key);

  const canonicalObjects = [device, cash, purchasing, inventory, orders].filter(Boolean);
  const passthrough = objects
    .filter((object) => !excluded.has(object?.objectKey))
    .map(rewriteCanonicalObjectReferences);

  return rewriteCanonicalObjectReferences({
    ...source,
    objects: [...passthrough, ...canonicalObjects],
    relationships: (source.relationships || [])
      .filter((relationship) => !REMOVED_OBJECTS.has(relationship?.parentObjectKey) && !REMOVED_OBJECTS.has(relationship?.childObjectKey))
      .map(rewriteCanonicalObjectReferences),
    rules: (source.rules || [])
      .filter((rule) => !REMOVED_OBJECTS.has(rule?.objectKey))
      .map(rewriteCanonicalObjectReferences),
    workflows: (source.workflows || [])
      .filter((workflow) => !REMOVED_OBJECTS.has(workflow?.objectKey))
      .map(rewriteCanonicalObjectReferences),
  });
}

function rewriteSalesObjectReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteSalesObjectReferences);
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      ["objectKey", "relatedObjectKey", "parentObjectKey", "childObjectKey"].includes(key)
      && SALES_LEGACY_OBJECTS.has(item)
    ) {
      next[key] = "sale_ledger";
    } else {
      next[key] = rewriteSalesObjectReferences(item);
    }
  }
  return next;
}

function importedNode(action) {
  return {
    id: action.id,
    key: "action",
    label: action.label || action.id,
    apiName: action.apiName || action.id,
    description: "",
    labelSource: "manual",
    apiNameSource: "manual",
    config: {
      actionKey: action.key,
      inputs: {},
      inputModes: {},
      inputIncluded: {},
      transforms: {},
      outputMode: "automatic",
      manualOutputs: [],
      importedRuntimeAction: action,
      importedRuntimeActionText: "",
    },
    configured: true,
    source: "runtime_import",
    position: null,
  };
}

function saleHeaderFields() {
  return {
    source_record_type: "SALE_HEADER",
    payment_data: { path: "variables.payments" },
  };
}

function saleLineCommonFields(headerStepId = "create_sale") {
  return {
    transaction_id: { path: `steps.${headerStepId}.created.transaction_id` },
    source_record_type: "SALE_LINE",
    receipt_number: { path: "variables.sale.receipt_number" },
    terminal_id: { path: "variables.sale.terminal_id" },
    user_id: { path: "variables.sale.user_id" },
    customer_id: { path: "variables.sale.customer_id" },
    status: { path: "variables.sale.status" },
    offline_created: { path: "variables.sale.offline_created" },
    sync_status: { path: "variables.sale.sync_status" },
    transaction_type: { path: "variables.sale.transaction_type" },
    original_transaction_id: { path: "variables.sale.original_transaction_id" },
    completed_at: { path: "variables.sale.completed_at" },
  };
}

function canonicalizeSalesWorkflow(flow) {
  const cloned = rewriteSalesObjectReferences(flow);
  const systemKey = cloned?.action?.systemKey;

  if (systemKey === "flow:sale.complete") {
    const createHeader = {
      id: "create_sale",
      label: "Create Sale Ledger Header",
      apiName: "create_sale",
      key: "CREATE_RECORD",
      objectKey: "sale_ledger",
      recordResource: { path: "variables.sale" },
      commonFieldValues: saleHeaderFields(),
      checkMatchingRecords: true,
      matchConditions: [
        { field: "client_request_id", value: { path: "variables.sale.client_request_id" } },
        { field: "source_record_type", value: "SALE_HEADER" },
      ],
      match: "all",
      matchAction: "skip",
      haltOnMatch: true,
      store: "record",
    };
    const createLines = {
      id: "create_items",
      label: "Create Sale Ledger Lines",
      apiName: "create_items",
      key: "CREATE_RECORD",
      objectKey: "sale_ledger",
      recordCollectionResource: { path: "variables.items" },
      commonFieldValues: saleLineCommonFields("create_sale"),
    };
    const createPayments = {
      id: "create_payments",
      label: "Create Sale Ledger Payments",
      apiName: "create_payments",
      key: "CREATE_RECORD",
      objectKey: "sale_ledger",
      recordCollectionResource: { path: "variables.payments" },
      commonFieldValues: {
        transaction_id: { path: "steps.create_sale.created.id" },
        sale_id: { path: "steps.create_sale.created.id" },
        source_record_type: "PAYMENT",
        transaction_type: "PAYMENT",
      },
    };
    cloned.action.actions = [createHeader, createLines, createPayments];
    cloned.action.gptBuilderElements = [createHeader, createLines, createPayments].map(importedNode);
    cloned.action.resources = (cloned.action.resources || []).map((resource) => {
      if (resource.apiName === "sale" || resource.apiName === "items") return { ...resource, objectKey: "sale_ledger" };
      if (resource.apiName === "payments") return { ...resource, objectKey: "sale_ledger" };
      return resource;
    });
    return cloned;
  }

  if (systemKey === "flow:refund.create") {
    cloned.action.actions = (cloned.action.actions || []).map((action) => {
      if (action.id !== "create_refund") return action;
      return {
        ...action,
        objectKey: "sale_ledger",
        commonFieldValues: {
          source_record_type: "REFUND",
          transaction_type: "SALE_RETURN",
          original_transaction_id: { path: "variables.refund.sale_id" },
          transaction_id: { path: "variables.refund.sale_id" },
          total: { path: "variables.refund.amount" },
          net_amount: { path: "variables.refund.amount" },
        },
      };
    });
    cloned.action.gptBuilderElements = (cloned.action.actions || []).map(importedNode);
    return cloned;
  }

  if (systemKey === "flow:exchange.create") {
    const actions = [];
    for (const action of cloned.action.actions || []) {
      if (action.id === "create_replacement_sale") {
        actions.push({
          ...action,
          objectKey: "sale_ledger",
          commonFieldValues: {
            source_record_type: "SALE_HEADER",
            payment_data: { path: "variables.payments" },
          },
        });
      } else if (action.id === "create_replacement_items") {
        actions.push({
          ...action,
          objectKey: "sale_ledger",
          commonFieldValues: saleLineCommonFields("create_replacement_sale"),
        });
      } else if (action.id === "create_exchange_payments") {
        actions.push({
          ...action,
          objectKey: "sale_ledger",
          commonFieldValues: {
            transaction_id: { path: "steps.create_replacement_sale.created.id" },
            sale_id: { path: "steps.create_replacement_sale.created.id" },
            source_record_type: "PAYMENT",
            transaction_type: "PAYMENT",
          },
        });
      } else {
        actions.push(action);
      }
    }
    cloned.action.actions = actions;
    cloned.action.gptBuilderElements = actions.map(importedNode);
    cloned.action.resources = (cloned.action.resources || []).map((resource) => {
      if (resource.apiName === "sale" || resource.apiName === "items") return { ...resource, objectKey: "sale_ledger" };
      if (resource.apiName === "payments") return { ...resource, objectKey: "sale_ledger" };
      return resource;
    });
    return cloned;
  }

  return cloned;
}

export function canonicalizeRetailSalesManifest(manifest) {
  const source = manifest && typeof manifest === "object" ? manifest : {};
  const objects = Array.isArray(source.objects) ? source.objects : [];
  const legacyObjects = objects.filter((object) => SALES_LEGACY_OBJECTS.has(object?.objectKey));
  if (!legacyObjects.length) return source;

  const sale = legacyObjects.find((object) => object.objectKey === "sale") || {};
  const fields = [];
  const seenFields = new Set();
  for (const object of legacyObjects) {
    for (const field of Array.isArray(object.fields) ? object.fields : []) {
      const apiName = String(field?.apiName || field?.api_name || "");
      if (!apiName || seenFields.has(apiName)) continue;
      seenFields.add(apiName);
      fields.push(rewriteSalesObjectReferences(field));
    }
  }

  for (const field of [
    { apiName: "source_record_type", label: "Source Record Type", fieldType: "text", sourceColumn: "source_record_type", writable: true },
    { apiName: "payment_data", label: "Payment Data", fieldType: "json", sourceColumn: "payment_data", writable: true },
  ]) {
    if (!seenFields.has(field.apiName)) fields.push(field);
  }

  const canonicalObject = rewriteSalesObjectReferences({
    ...sale,
    objectKey: "sale_ledger",
    label: "Sale Ledger",
    pluralLabel: "Sale Ledger",
    description: "Canonical sales ledger metadata object.",
    sourceTable: "sale_ledger",
    fields,
  });

  const relationships = (Array.isArray(source.relationships) ? source.relationships : [])
    .filter((relationship) => !(
      SALES_LEGACY_OBJECTS.has(relationship?.parentObjectKey)
      && SALES_LEGACY_OBJECTS.has(relationship?.childObjectKey)
    ))
    .map(rewriteSalesObjectReferences);

  const workflows = (Array.isArray(source.workflows) ? source.workflows : [])
    .map(canonicalizeSalesWorkflow);

  return rewriteSalesObjectReferences({
    ...source,
    objects: [
      ...objects.filter((object) => !SALES_LEGACY_OBJECTS.has(object?.objectKey)),
      canonicalObject,
    ],
    relationships,
    workflows,
  });
}

function loadManifestMap() {
  if (cache) return cache;
  const entries = new Map();
  for (const file of readdirSync(manifestDirectory, { withFileTypes: true })) {
    if (!file.isFile() || extname(file.name) !== ".json") continue;
    const packageKey = file.name.slice(0, -5);
    const parsed = JSON.parse(readFileSync(join(manifestDirectory, file.name), "utf8"));
    const salesCanonical = packageKey === "retail_pos"
      ? canonicalizeRetailSalesManifest(parsed)
      : rewriteSalesObjectReferences(parsed);
    entries.set(packageKey, canonicalizeObjectFamilies(salesCanonical));
  }
  cache = entries;
  return cache;
}

export function metadataManifestByPackageKey(packageKey) {
  return loadManifestMap().get(String(packageKey || "")) || null;
}
