import test from "node:test";
import assert from "node:assert/strict";

import {
  reconstructHistoricalRows,
  validateHistoricalTrendForObject,
} from "../server/services/reportHistoricalTrend.js";

const OBJECT = {
  config: {
    historicalTrending: {
      enabled: true,
      enabledAt: "2026-07-01T00:00:00.000Z",
      fields: ["amount", "stage"],
    },
  },
};

const FIELDS = [
  { api_name: "amount", field_type: "currency", readable: true },
  { api_name: "stage", field_type: "picklist", readable: true },
];

test("historical trend rejects snapshots before enablement", () => {
  assert.throws(
    () => validateHistoricalTrendForObject(
      { enabled: true, snapshotDates: ["2026-06-30"], historicalFilters: [] },
      OBJECT,
      FIELDS,
    ),
    /predates Historical Trending enablement/,
  );
});

test("historical trend exposes only readable configured fields", () => {
  const trend = validateHistoricalTrendForObject(
    { enabled: true, snapshotDates: ["2026-10-02"], historicalFilters: [] },
    OBJECT,
    [
      { api_name: "amount", field_type: "currency", readable: true },
      { api_name: "stage", field_type: "picklist", readable: false },
    ],
  );
  assert.deepEqual(trend.trackedFields, ["amount"]);
});

test("historical reconstruction uses the value established at the snapshot", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = async () => ({
    rows: [
      {
        record_id: id,
        field_api_name: "amount",
        old_value: 50,
        new_value: 100,
        action: "update",
        created_at: "2026-10-03T09:00:00.000Z",
      },
    ],
  });
  const rows = await reconstructHistoricalRows({
    db,
    companyId: "22222222-2222-4222-8222-222222222222",
    objectId: "33333333-3333-4333-8333-333333333333",
    currentRows: [{ __recordId: id, amount: 100 }],
    trend: {
      enabled: true,
      snapshotDates: ["2026-10-02"],
      historicalFilters: [],
      trackedFields: ["amount"],
    },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount__historical, 50);
  assert.equal(rows[0].__snapshotDate, "2026-10-02");
});

test("historical reconstruction does not fabricate today's value when history is absent", async () => {
  const db = async () => ({ rows: [] });
  const rows = await reconstructHistoricalRows({
    db,
    companyId: "22222222-2222-4222-8222-222222222222",
    objectId: "33333333-3333-4333-8333-333333333333",
    currentRows: [{ __recordId: "11111111-1111-4111-8111-111111111111", amount: 100 }],
    trend: {
      enabled: true,
      snapshotDates: ["2026-10-02"],
      historicalFilters: [],
      trackedFields: ["amount"],
    },
  });
  assert.deepEqual(rows, []);
});

test("Any Snapshot Date requires the condition across every selected snapshot", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = async () => ({
    rows: [
      {
        record_id: id,
        field_api_name: "amount",
        old_value: 40,
        new_value: 60,
        action: "update",
        created_at: "2026-10-02T12:00:00.000Z",
      },
      {
        record_id: id,
        field_api_name: "amount",
        old_value: 60,
        new_value: 100,
        action: "update",
        created_at: "2026-10-04T12:00:00.000Z",
      },
    ],
  });
  const rows = await reconstructHistoricalRows({
    db,
    companyId: "22222222-2222-4222-8222-222222222222",
    objectId: "33333333-3333-4333-8333-333333333333",
    currentRows: [{ __recordId: id, amount: 100 }],
    trend: {
      enabled: true,
      snapshotDates: ["2026-10-01", "2026-10-03"],
      historicalFilters: [
        { field: "amount", operator: "gte", value: 50, snapshotMode: "ANY", snapshotDate: null },
      ],
      trackedFields: ["amount"],
    },
  });
  assert.deepEqual(rows, []);
});

test("specific snapshot filter evaluates only the chosen snapshot", async () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const db = async () => ({
    rows: [
      {
        record_id: id,
        field_api_name: "amount",
        old_value: 40,
        new_value: 60,
        action: "update",
        created_at: "2026-10-02T12:00:00.000Z",
      },
      {
        record_id: id,
        field_api_name: "amount",
        old_value: 60,
        new_value: 100,
        action: "update",
        created_at: "2026-10-04T12:00:00.000Z",
      },
    ],
  });
  const rows = await reconstructHistoricalRows({
    db,
    companyId: "22222222-2222-4222-8222-222222222222",
    objectId: "33333333-3333-4333-8333-333333333333",
    currentRows: [{ __recordId: id, amount: 100 }],
    trend: {
      enabled: true,
      snapshotDates: ["2026-10-01", "2026-10-03"],
      historicalFilters: [
        { field: "amount", operator: "gte", value: 50, snapshotMode: "SPECIFIC", snapshotDate: "2026-10-03" },
      ],
      trackedFields: ["amount"],
    },
  });
  assert.equal(rows.length, 2);
});
