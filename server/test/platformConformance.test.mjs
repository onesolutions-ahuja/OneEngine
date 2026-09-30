import test from "node:test";
import assert from "node:assert/strict";
import {
  PLATFORM_API_VERSION,
  PLATFORM_METADATA_SCHEMA_VERSION,
  PLATFORM_RUNTIME_CONTRACT_VERSION,
  platformRuntimeContract,
  validatePlatformCompatibility,
  assertPlatformCompatibility,
  normalizeTraceEnvelope,
  auditPlatformConformance,
} from "../services/platformConformance.js";

test("runtime contract exposes stable platform version identifiers", () => {
  const contract = platformRuntimeContract();
  assert.equal(contract.runtime, "OneEngine");
  assert.equal(contract.runtimeContractVersion, PLATFORM_RUNTIME_CONTRACT_VERSION);
  assert.equal(contract.metadataSchemaVersion, PLATFORM_METADATA_SCHEMA_VERSION);
  assert.equal(contract.apiVersion, PLATFORM_API_VERSION);
  assert.equal(Object.isFrozen(contract), true);
});

test("platform compatibility accepts older/equal requirements and rejects newer runtime requirements", () => {
  assert.equal(validatePlatformCompatibility("1.0.0", "1.0.0").compatible, true);
  assert.equal(validatePlatformCompatibility("0.9.0", "1.0.0").compatible, true);
  assert.equal(validatePlatformCompatibility("2.0.0", "1.0.0").compatible, false);
  assert.throws(
    () => assertPlatformCompatibility("2.0.0", "1.0.0"),
    (error) => error.code === "PLATFORM_RUNTIME_INCOMPATIBLE" && error.status === 409,
  );
});

test("trace envelope uses transaction id as correlation fallback", () => {
  const trace = normalizeTraceEnvelope({
    transactionId: "11111111-1111-1111-1111-111111111111",
    workflowRunId: "22222222-2222-2222-2222-222222222222",
    eventId: "33333333-3333-3333-3333-333333333333",
    source: "WORKFLOW",
    executionMode: "USER",
  });
  assert.equal(trace.correlationId, trace.transactionId);
  assert.equal(trace.source, "WORKFLOW");
  assert.equal(trace.executionMode, "USER");
  assert.equal(trace.runtimeContractVersion, PLATFORM_RUNTIME_CONTRACT_VERSION);
});

test("conformance audit detects metadata identity, schema drift, relationship, and package compatibility issues", async () => {
  const db = async (sql) => {
    if (sql.includes("FROM platform_objects") && sql.includes("object_key IS NULL")) {
      return { rows: [{ id: "o1", object_key: "", api_name: "bad", source_table: "bad-table" }] };
    }
    if (sql.includes("FROM platform_fields") && sql.includes("api_name IS NULL")) {
      return { rows: [{ id: "f1", object_id: "o1", api_name: "", source_column: "x", field_type: "text" }] };
    }
    if (sql.includes("GROUP BY object_key")) return { rows: [{ object_key: "duplicate", count: 2 }] };
    if (sql.includes("GROUP BY object_id,api_name")) return { rows: [{ object_id: "o2", api_name: "name", count: 2 }] };
    if (sql.includes("information_schema.tables")) {
      return {
        rows: [
          { object_id: "o3", object_key: "missing", source_table: "missing_table", field_id: null, api_name: null, source_column: null, issue: "MISSING_SOURCE_TABLE" },
        ],
      };
    }
    if (sql.includes("FROM platform_relationships r")) {
      return { rows: [{ id: "r1", relationship_key: "broken", parent_object_id: null, child_object_id: "o2", child_field_id: null }] };
    }
    if (sql.includes("FROM company_package_installations")) {
      return {
        rows: [{
          package_key: "future-package",
          version: "1.0.0",
          required_platform_version: "2.0.0",
          installed_version: "1.0.0",
          installation_version: "1.0.0",
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const report = await auditPlatformConformance({ db, companyId: "11111111-1111-1111-1111-111111111111" });
  assert.equal(report.compliant, false);
  assert.equal(report.issues.objects.length, 1);
  assert.equal(report.issues.fields.length, 1);
  assert.equal(report.issues.duplicateObjects.length, 1);
  assert.equal(report.issues.duplicateFields.length, 1);
  assert.equal(report.issues.schemaDrift.length, 1);
  assert.equal(report.issues.relationships.length, 1);
  assert.equal(report.issues.incompatiblePackages.length, 1);
});

test("clean conformance audit reports compliant", async () => {
  const db = async (sql) => {
    if (sql.includes("FROM company_package_installations")) return { rows: [] };
    return { rows: [] };
  };
  const report = await auditPlatformConformance({ db, companyId: "11111111-1111-1111-1111-111111111111" });
  assert.equal(report.compliant, true);
  assert.deepEqual(report.issues.schemaDrift, []);
});
