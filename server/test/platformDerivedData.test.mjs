import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDerivedDefaults,
  buildDerivedDependencyGraph,
  recalculateDerivedRecord,
} from "../services/platformDerivedData.js";

test("field defaults preserve explicit values and evaluate default expressions", () => {
  const fields = [
    {
      api_name: "qty",
      field_type: "number",
      writable: true,
      active: true,
      readable: true,
      source_column: "qty",
      config: { defaultValue: 2 },
    },
    {
      api_name: "unit_price",
      field_type: "currency",
      writable: true,
      active: true,
      readable: true,
      source_column: "unit_price",
      config: { defaultValue: 5 },
    },
    {
      api_name: "suggested_total",
      field_type: "currency",
      writable: true,
      active: true,
      readable: true,
      source_column: "suggested_total",
      config: { defaultExpression: "qty * unit_price" },
    },
  ];

  assert.deepEqual(
    applyDerivedDefaults(fields, {}),
    { qty: 2, unit_price: 5, suggested_total: 10 },
  );
  assert.deepEqual(
    applyDerivedDefaults(fields, { qty: 3, suggested_total: 99 }),
    { qty: 3, suggested_total: 99, unit_price: 5 },
  );
});

test("derived graph exposes formula and rollup dependencies", () => {
  const graph = buildDerivedDependencyGraph([
    {
      api_name: "customer_email",
      field_type: "formula",
      active: true,
      config: { expression: "customer.email", resultType: "text" },
    },
    {
      api_name: "order_total",
      field_type: "rollup",
      active: true,
      config: { relationshipKey: "order_lines", operation: "SUM", sourceField: "line_total" },
    },
  ]);
  assert.deepEqual(graph.customer_email.dependencies, ["customer.email"]);
  assert.deepEqual(graph.order_total.dependencies, ["order_lines.line_total"]);
});

test("cross-object formulas hydrate one lookup once and reuse it across formula paths", async () => {
  const object = { id: "order-object", object_key: "order", source_table: "orders" };
  const fields = [
    {
      id: "customer-field",
      api_name: "customer",
      label: "Customer",
      field_type: "lookup",
      source_column: "customer_id",
      active: true,
      readable: true,
      writable: true,
      config: { relatedObjectKey: "customer" },
    },
    {
      api_name: "customer_email",
      field_type: "formula",
      source_column: null,
      active: true,
      readable: true,
      writable: false,
      required: false,
      config: { expression: "customer.email", resultType: "text" },
    },
    {
      api_name: "customer_name",
      field_type: "formula",
      source_column: null,
      active: true,
      readable: true,
      writable: false,
      required: false,
      config: { expression: "customer.name", resultType: "text" },
    },
  ];

  let customerReads = 0;
  const db = async (sql, params = []) => {
    if (sql.includes("FROM platform_objects")) {
      return {
        rows: [{
          id: "customer-object",
          object_key: "customer",
          source_table: "customers",
          company_scoped: true,
          store_scoped: false,
        }],
      };
    }
    if (sql.includes("FROM platform_fields")) {
      return {
        rows: [
          { api_name: "email", field_type: "email", source_column: "email", active: true, readable: true },
          { api_name: "name", field_type: "text", source_column: "name", active: true, readable: true },
        ],
      };
    }
    if (sql.includes('FROM "customers"')) {
      customerReads += 1;
      assert.deepEqual(params, ["customer-1", "company-1"]);
      return { rows: [{ id: "customer-1", email: "a@example.com", name: "A Customer" }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await recalculateDerivedRecord({
    db,
    object,
    fields,
    record: { id: "order-1", customer: "customer-1" },
    req: { user: { companyId: "company-1", storeId: null } },
  });

  assert.equal(result.customer_email, "a@example.com");
  assert.equal(result.customer_name, "A Customer");
  assert.equal(customerReads, 1);
});

test("rollup is evaluated before dependent formula", async () => {
  const object = { id: "order-object", object_key: "order", source_table: "orders" };
  const fields = [
    {
      api_name: "line_total_sum",
      field_type: "rollup",
      active: true,
      readable: true,
      writable: false,
      required: false,
      config: { relationshipKey: "order_lines", operation: "SUM", sourceField: "line_total", resultType: "currency" },
    },
    {
      api_name: "double_total",
      field_type: "formula",
      source_column: null,
      active: true,
      readable: true,
      writable: false,
      required: false,
      config: { expression: "line_total_sum * 2", resultType: "currency" },
    },
  ];

  const db = async (sql) => {
    if (sql.includes("FROM platform_relationships")) {
      return {
        rows: [{
          child_object_id: "line-object",
          child_field_id: "order-lookup",
          child_source_table: "order_lines",
          child_company_scoped: true,
          child_store_scoped: false,
        }],
      };
    }
    if (sql.includes("FROM platform_fields")) {
      return {
        rows: [
          { id: "order-lookup", api_name: "order_id", field_type: "lookup", source_column: "order_id", active: true },
          { id: "line-total", api_name: "line_total", field_type: "currency", source_column: "line_total", active: true },
        ],
      };
    }
    if (sql.includes('FROM "order_lines"')) {
      return { rows: [{ order_id: "order-1", line_total: 3 }, { order_id: "order-1", line_total: 7 }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await recalculateDerivedRecord({
    db,
    object,
    fields,
    record: { id: "order-1" },
    req: { user: { companyId: "company-1", storeId: null } },
  });

  assert.equal(result.line_total_sum, 10);
  assert.equal(result.double_total, 20);
});


test("cross-object formula metadata prefers tenant object over global object with same key", async () => {
  const fields = [
    {
      api_name: "customer",
      field_type: "lookup",
      source_column: "customer_id",
      active: true,
      config: { relatedObjectKey: "customer" },
    },
    {
      api_name: "customer_name",
      field_type: "formula",
      active: true,
      writable: false,
      config: { expression: "customer.name", resultType: "text" },
    },
  ];

  const db = async (sql, params = []) => {
    if (sql.includes("FROM platform_objects")) {
      assert.match(sql, /CASE WHEN company_id=\$2 THEN 0 ELSE 1 END/);
      return {
        rows: [{
          id: "tenant-customer-object",
          object_key: "customer",
          source_table: "tenant_customers",
          company_id: params[1],
          company_scoped: true,
          store_scoped: false,
        }],
      };
    }
    if (sql.includes("FROM platform_fields")) {
      return { rows: [{ api_name: "name", field_type: "text", source_column: "name", active: true }] };
    }
    if (sql.includes('FROM "tenant_customers"')) {
      return { rows: [{ id: "cust-1", name: "Tenant Customer" }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await recalculateDerivedRecord({
    db,
    object: { id: "order-object", object_key: "order", source_table: "orders" },
    fields,
    record: { id: "order-1", customer: "cust-1" },
    req: { user: { companyId: "company-1", storeId: null } },
  });

  assert.equal(result.customer_name, "Tenant Customer");
});
