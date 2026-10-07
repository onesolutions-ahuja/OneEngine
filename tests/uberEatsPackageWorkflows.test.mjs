import test from "node:test";
import assert from "node:assert/strict";
import { packageDefinition } from "../server/services/packageRegistry.js";

const entry = { key: "uber_eats", packageKey: "uber_eats", name: "Uber Eats", publisher: "OneSolutions" };
const manifest = packageDefinition(entry).manifest;
const flows = manifest.workflows.filter((item) => String(item?.action?.apiName || "").startsWith("GPT_UBER_EATS_"));

test("Uber Eats package installs all editable workflows", () => {
  assert.equal(flows.length, 8);
  assert.deepEqual(new Set(flows.map((item) => item.action.apiName)), new Set([
    "GPT_UBER_EATS_GET_STORES","GPT_UBER_EATS_TEST_CONNECTION","GPT_UBER_EATS_UPLOAD_MENU",
    "GPT_UBER_EATS_ACCEPT_ORDER","GPT_UBER_EATS_DENY_ORDER","GPT_UBER_EATS_UPDATE_ITEM_PRICE",
    "GPT_UBER_EATS_SET_ITEM_UNAVAILABLE","GPT_UBER_EATS_SET_ITEM_AVAILABLE",
  ]));
  for (const flow of flows) {
    assert.equal(flow.active, true);
    assert.ok(Array.isArray(flow.action.resources));
    assert.ok(Array.isArray(flow.action.actions));
    assert.ok(flow.action.actions.length > 0);
  }
});

test("Uber package actions route to installed subflows instead of provider functions", () => {
  assert.equal(manifest.actions.length, 8);
  for (const action of manifest.actions) {
    assert.equal(action.handlerKey, "RUN_SUBFLOW");
    assert.match(action.config?.subflowApiName || "", /^GPT_UBER_EATS_/);
  }
});

test("Uber menu upload is metadata-driven from Product records", () => {
  const flow = flows.find((item) => item.action.apiName === "GPT_UBER_EATS_UPLOAD_MENU");
  const keys = flow.action.actions.map((item) => item.key);
  assert.deepEqual(keys.slice(0,5), ["GET_RECORDS","TRANSFORM","TRANSFORM","TRANSFORM","ONE_HTTP_REQUEST"]);
  const request = flow.action.actions.find((item) => item.id === "upload_menu");
  assert.equal(request.endpoint, "/v2/eats/stores/{{storeId}}/menus");
  assert.ok(request.body.menus);
  assert.ok(request.body.categories);
  assert.ok(request.body.items);
});
