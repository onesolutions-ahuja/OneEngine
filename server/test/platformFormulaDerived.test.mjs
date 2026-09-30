import test from "node:test";
import assert from "node:assert/strict";
import {
  FormulaError,
  buildFormulaDependencyGraph,
  compileFormulas,
  formulaDependencies,
  parseFormula,
} from "../services/platformFormula.js";

const baseFields = [
  { api_name: "qty", field_type: "number", source_column: "qty", active: true, readable: true },
  { api_name: "price", field_type: "currency", source_column: "price", active: true, readable: true },
];

test("formula dependency graph is deterministic and topological", () => {
  const fields = [
    ...baseFields,
    {
      api_name: "subtotal",
      field_type: "formula",
      source_column: null,
      required: false,
      writable: false,
      active: true,
      readable: true,
      config: { resultType: "currency", expression: "qty * price" },
    },
    {
      api_name: "double_total",
      field_type: "formula",
      source_column: null,
      required: false,
      writable: false,
      active: true,
      readable: true,
      config: { resultType: "currency", expression: "subtotal * 2" },
    },
  ];
  const graph = buildFormulaDependencyGraph(fields);
  assert.deepEqual(graph.order, ["subtotal", "double_total"]);
  assert.deepEqual(graph.dependencies.double_total, ["subtotal"]);

  const calculate = compileFormulas(fields);
  const result = calculate({ qty: 3, price: 4 });
  assert.equal(result.subtotal, 12);
  assert.equal(result.double_total, 24);
});

test("formula graph rejects cycles", () => {
  const fields = [
    {
      api_name: "a",
      field_type: "formula",
      source_column: null,
      required: false,
      writable: false,
      active: true,
      readable: true,
      config: { resultType: "number", expression: "b + 1" },
    },
    {
      api_name: "b",
      field_type: "formula",
      source_column: null,
      required: false,
      writable: false,
      active: true,
      readable: true,
      config: { resultType: "number", expression: "a + 1" },
    },
  ];
  assert.throws(
    () => buildFormulaDependencyGraph(fields),
    (error) => error instanceof FormulaError,
  );
  assert.throws(
    () => compileFormulas(fields),
    (error) => error instanceof FormulaError,
  );
});

test("parser and dependency extractor accept dotted lookup paths", () => {
  assert.doesNotThrow(() => parseFormula("customer.email"));
  assert.deepEqual(
    formulaDependencies('CONCAT(customer.first_name, " ", customer.last_name)'),
    ["customer.first_name", "customer.last_name"],
  );
});
