import test from "node:test";
import assert from "node:assert/strict";
import { packageDefinition } from "../server/services/packageRegistry.js";
import { executeWorkflowActions } from "../server/services/platformWorkflow.js";

const entry = { key: "uber_eats", packageKey: "uber_eats", name: "Uber Eats", publisher: "OneSolutions" };
const flows = packageDefinition(entry).manifest.workflows
  .filter((item) => String(item?.action?.apiName || "").startsWith("GPT_UBER_EATS_"));
const byApi = new Map(flows.map((flow) => [flow.action.apiName, flow.action]));

function runtime({ products = [], response = { ok: true, status: 200, body: { ok: true } } } = {}) {
  const calls = [];
  const productObject = { id: "obj-product", object_key: "product", source_table: "products", company_id: null, company_scoped: true, store_scoped: false, active: true };
  const productFields = ["name","description","price","vat_rate","uber_item_id","category_id","available_on_uber","active"]
    .map((name, index) => ({ id: "f"+index, object_id: productObject.id, api_name: name, source_column: name, active: true, readable: true, writable: true, display_order: index, label: name }));
  const db = async (sql, params = []) => {
    const s = String(sql);
    if (s.includes("FROM role_permissions") && s.includes("p.code = ANY")) return { rows: (params[2] || []).map((code) => ({ code })) };
    if (s.includes("FROM platform_object_permissions")) return { rows: [{ can_view: true, can_create: true, can_edit: true, can_delete: true }] };
    if (s.includes("FROM platform_permission_set_assignments")) return { rows: [] };
    if (s.includes("FROM role_permissions") && s.includes("p.code=$2")) return { rows: [{ ok: 1 }] };
    if (s.includes("FROM platform_objects")) return { rows: [productObject] };
    if (s.includes("FROM platform_fields")) return { rows: productFields };
    if (s.includes('FROM "products"')) return { rows: products };
    if (s.includes("FROM platform_connector_definitions")) return { rows: [] };
    if (s.includes("FROM integration_connections")) return { rows: [{
      id: "connection-uber",
      base_url: "https://api.uber.test",
      auth_type: "none",
      credentials_encrypted: null,
      connector_configuration: {},
    }] };
    if (s.includes("platform_workflow_step_runs") || s.includes("platform_workflow_runs")) return { rows: [] };
    return { rows: [] };
  };
  const req = { user: { id: "u1", companyId: "c1", storeId: null, roleId: "r1", permissions: ["workflow.execute","integrations.execute","records.view"] }, _workflowEffectivePermissionSets: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    return { ok: response.ok, status: response.status, text: async () => JSON.stringify(response.body) };
  };
  return {
    calls, db, req,
    restore: () => { globalThis.fetch = originalFetch; },
  };
}

async function run(apiName, inputs = {}, options = {}) {
  const flow = byApi.get(apiName);
  assert.ok(flow, apiName + " flow missing");
  const rt = runtime(options);
  const workflowVariables = { variables: { ...inputs }, steps: {} };
  try {
    const results = await executeWorkflowActions({
      actions: flow.actions,
      allActions: flow.actions,
      db: rt.db,
      req: rt.req,
      companyId: "c1",
      userId: "u1",
      record: { ...inputs },
      workflowVariables,
    });
    return { ...rt, results, workflowVariables };
  } finally {
    rt.restore();
  }
}

test("all eight Uber GPT flows validate through the runtime registry", async () => {
  const expected = [
    "GPT_UBER_EATS_GET_STORES","GPT_UBER_EATS_TEST_CONNECTION","GPT_UBER_EATS_UPLOAD_MENU",
    "GPT_UBER_EATS_ACCEPT_ORDER","GPT_UBER_EATS_DENY_ORDER","GPT_UBER_EATS_UPDATE_ITEM_PRICE",
    "GPT_UBER_EATS_SET_ITEM_UNAVAILABLE","GPT_UBER_EATS_SET_ITEM_AVAILABLE",
  ];
  assert.deepEqual([...byApi.keys()].sort(), expected.sort());
});

test("Get Stores and Test Connection execute HTTP and expose successful debug outputs", async () => {
  for (const apiName of ["GPT_UBER_EATS_GET_STORES","GPT_UBER_EATS_TEST_CONNECTION"]) {
    const result = await run(apiName, {}, { response: { ok: true, status: 200, body: { stores: [{ id: "store-1" }] } } });
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].method, "GET");
    assert.match(result.calls[0].url, /\/v1\/eats\/stores$/);
    assert.equal(result.workflowVariables.variables.success, true);
    assert.deepEqual(result.workflowVariables.variables.data, { stores: [{ id: "store-1" }] });
  }
});

test("Accept and Deny Order interpolate order ID and build the expected request bodies", async () => {
  const accepted = await run("GPT_UBER_EATS_ACCEPT_ORDER", { orderId: "order 123" });
  assert.match(accepted.calls[0].url, /\/v1\/eats\/orders\/order%20123\/accept_pos_order$/);
  assert.deepEqual(accepted.calls[0].body, { reason: "Accepted by POS" });
  assert.equal(accepted.workflowVariables.variables.success, true);

  const denied = await run("GPT_UBER_EATS_DENY_ORDER", { orderId: "order-9", reason: "No stock" });
  assert.match(denied.calls[0].url, /\/v1\/eats\/orders\/order-9\/deny_pos_order$/);
  assert.deepEqual(denied.calls[0].body, { reason: { explanation: "No stock", code: "OTHER" } });
  assert.equal(denied.workflowVariables.variables.success, true);
});

test("Update Item Price executes Formula then sends minor-unit price", async () => {
  const result = await run("GPT_UBER_EATS_UPDATE_ITEM_PRICE", { storeId: "s1", itemId: "i1", price: 12.34 });
  assert.match(result.calls[0].url, /\/v2\/eats\/stores\/s1\/menus\/items\/i1$/);
  assert.equal(result.calls[0].body.price_info.price, 1234);
  assert.deepEqual(result.calls[0].body.price_info.overrides, []);
  assert.equal(result.workflowVariables.variables.success, true);
});

test("Set Item Unavailable and Available send suspension payloads", async () => {
  const unavailable = await run("GPT_UBER_EATS_SET_ITEM_UNAVAILABLE", { storeId: "s1", itemId: "i1", suspendUntil: 1893456000 });
  assert.equal(unavailable.calls[0].body.suspension_info.suspension.suspend_until, 1893456000);
  assert.equal(unavailable.calls[0].body.suspension_info.suspension.reason, "Out of stock");
  assert.equal(unavailable.workflowVariables.variables.success, true);

  const available = await run("GPT_UBER_EATS_SET_ITEM_AVAILABLE", { storeId: "s1", itemId: "i1" });
  assert.equal(available.calls[0].body.suspension_info.suspension.suspend_until, null);
  assert.equal(available.workflowVariables.variables.success, true);
});

test("Upload Menu executes Get Records, Transform and HTTP with mapped product data", async () => {
  const products = [{
    id: "p1", name: "Burger", description: "Fresh", price: 7.5, vat_rate: 20,
    uber_item_id: "uber-p1", category_id: "cat1", available_on_uber: true, active: true,
  }];
  const result = await run("GPT_UBER_EATS_UPLOAD_MENU", { storeId: "store-1" }, { products });
  assert.equal(result.calls.length, 1);
  assert.match(result.calls[0].url, /\/v2\/eats\/stores\/store-1\/menus$/);
  assert.equal(result.calls[0].method, "PUT");
  assert.equal(result.calls[0].body.items[0].id, "uber-p1");
  assert.equal(result.calls[0].body.items[0].price_info.price, 750);
  assert.equal(result.calls[0].body.items[0].title.translations.en_us, "Burger");
  assert.equal(result.workflowVariables.variables.success, true);
});

test("HTTP failure follows each flow's failure branch and exposes failure outputs", async () => {
  const result = await run("GPT_UBER_EATS_GET_STORES", {}, { response: { ok: false, status: 401, body: { error: "unauthorized" } } });
  assert.equal(result.workflowVariables.variables.success, false);
  assert.deepEqual(result.workflowVariables.variables.data, { error: "unauthorized" });
});
