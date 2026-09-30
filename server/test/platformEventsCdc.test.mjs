import test from "node:test";
import assert from "node:assert/strict";
import {
  changedFieldNames,
  publishPlatformEvent,
  publishRecordChangeEvent,
} from "../services/platformEvents.js";

test("changedFieldNames reports canonical CREATE UPDATE DELETE changes", () => {
  assert.deepEqual(changedFieldNames(null, { b: 2, a: 1 }, "CREATE"), ["a", "b"]);
  assert.deepEqual(
    changedFieldNames({ id: "1", name: "Old", same: 1 }, { id: "1", name: "New", same: 1, added: true }, "UPDATE"),
    ["added", "name"],
  );
  assert.deepEqual(changedFieldNames({ z: 1, a: 2 }, null, "DELETE"), ["a", "z"]);
});

test("event hop limit suppresses runaway chains before persistence", async () => {
  let touched = false;
  const result = await publishPlatformEvent({
    db: async () => {
      touched = true;
      throw new Error("db should not be reached");
    },
    eventType: "platform.object.record.updated",
    payload: {},
    req: {
      platformEvent: {
        eventId: "parent-event",
        rootEventId: "root-event",
        hopCount: 16,
      },
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "EVENT_HOP_LIMIT");
  assert.equal(touched, false);
});

test("event loop prevention suppresses a repeated signature in the same lineage", async () => {
  const existing = {
    id: "evt-1",
    replay_id: 11,
    company_id: null,
    event_type: "platform.object.record.updated",
    payload: { recordId: "r1" },
    actor_user_id: null,
    origin_type: "WORKFLOW",
    origin_id: null,
    correlation_id: "corr-1",
    causation_event_id: "evt-0",
    root_event_id: "root-1",
    hop_count: 2,
    object_id: null,
    record_id: "r1",
    operation: "UPDATE",
    changed_fields: ["name"],
    event_signature: "same-signature",
    created_at: new Date().toISOString(),
  };
  let inserts = 0;
  const db = async (sql, params = []) => {
    if (sql.includes("WHERE id = ANY($1::uuid[])")) {
      return { rows: params[0].map((id) => ({ id, company_id: null })) };
    }
    if (sql.includes("WHERE root_event_id=$1") && sql.includes("event_signature=$2")) return { rows: [existing] };
    if (sql.includes("INSERT INTO platform_events")) {
      inserts += 1;
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await publishPlatformEvent({
    db,
    eventType: existing.event_type,
    payload: existing.payload,
    rootEventId: "root-1",
    causationEventId: "evt-0",
    hopCount: 2,
    recordId: "r1",
    operation: "UPDATE",
    changedFields: ["name"],
    signature: "same-signature",
  });

  assert.equal(result.skipped, true);
  assert.equal(result.reason, "EVENT_LOOP_PREVENTED");
  assert.equal(result.event.replayId, 11);
  assert.equal(inserts, 0);
});

test("record change publisher carries prior/current state, lineage, replay and changed fields", async () => {
  let insertParams = null;
  const db = async (sql, params = []) => {
    if (sql.includes("WHERE id = ANY($1::uuid[])")) {
      return { rows: params[0].map((id) => ({ id, company_id: null })) };
    }
    if (sql.includes("WHERE root_event_id=$1") && sql.includes("event_signature=$2")) return { rows: [] };
    if (sql.includes("INSERT INTO platform_events")) {
      insertParams = params;
      return {
        rows: [{
          id: "evt-2",
          replay_id: 42,
          company_id: null,
          event_type: "platform.object.record.updated",
          payload: JSON.parse(params[2]),
          actor_user_id: params[3],
          idempotency_key: params[4],
          origin_type: params[5],
          origin_id: params[6],
          correlation_id: params[7],
          causation_event_id: params[8],
          root_event_id: params[9],
          hop_count: params[10],
          object_id: params[11],
          record_id: params[12],
          operation: params[13],
          changed_fields: JSON.parse(params[14]),
          event_signature: params[15],
          created_at: new Date().toISOString(),
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await publishRecordChangeEvent({
    db,
    companyId: null,
    object: { id: "object-1", object_key: "customer" },
    previousRecord: { id: "record-1", name: "Old", same: 1 },
    record: { id: "record-1", name: "New", same: 1 },
    operation: "UPDATE",
    actorUserId: "user-1",
    req: {
      platformEvent: {
        eventId: "evt-parent",
        rootEventId: "evt-root",
        hopCount: 3,
      },
    },
    originType: "WORKFLOW",
    correlationId: "corr-2",
  });

  assert.equal(result.inserted, true);
  assert.equal(result.event.replayId, 42);
  assert.equal(result.event.rootEventId, "evt-root");
  assert.equal(result.event.causationEventId, "evt-parent");
  assert.equal(result.event.hopCount, 4);
  assert.deepEqual(result.event.changedFields, ["name"]);
  assert.deepEqual(result.event.payload.previousRecord.name, "Old");
  assert.deepEqual(result.event.payload.record.name, "New");
  assert.equal(insertParams[13], "UPDATE");
});

test("idempotent event publish replays the existing durable event", async () => {
  const existing = {
    id: "evt-existing",
    replay_id: 99,
    company_id: null,
    event_type: "custom.test",
    payload: { value: 1 },
    actor_user_id: null,
    idempotency_key: "same-key",
    origin_type: "API",
    origin_id: null,
    correlation_id: null,
    causation_event_id: null,
    root_event_id: "evt-existing",
    hop_count: 0,
    object_id: null,
    record_id: null,
    operation: null,
    changed_fields: [],
    event_signature: "sig",
    created_at: new Date().toISOString(),
  };

  const db = async (sql) => {
    if (sql.includes("INSERT INTO platform_events")) return { rows: [] };
    if (sql.includes("company_id IS NOT DISTINCT FROM")) return { rows: [existing] };
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const result = await publishPlatformEvent({
    db,
    eventType: "custom.test",
    payload: { value: 1 },
    idempotencyKey: "same-key",
  });

  assert.equal(result.inserted, false);
  assert.equal(result.event.id, "evt-existing");
  assert.equal(result.event.replayId, 99);
});


test("event lineage rejects cross-company parent/root references", async () => {
  const db = async (sql, params = []) => {
    if (sql.includes("WHERE id = ANY($1::uuid[])")) {
      return {
        rows: params[0].map((id) => ({
          id,
          company_id: "other-company",
        })),
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await assert.rejects(
    () => publishPlatformEvent({
      db,
      companyId: "company-1",
      eventType: "custom.child",
      payload: {},
      causationEventId: "00000000-0000-0000-0000-000000000001",
      rootEventId: "00000000-0000-0000-0000-000000000002",
    }),
    (error) => error.code === "EVENT_LINEAGE_COMPANY_MISMATCH" && error.status === 403,
  );
});

test("event lineage rejects missing referenced events", async () => {
  const db = async (sql) => {
    if (sql.includes("WHERE id = ANY($1::uuid[])")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await assert.rejects(
    () => publishPlatformEvent({
      db,
      companyId: "company-1",
      eventType: "custom.child",
      payload: {},
      causationEventId: "00000000-0000-0000-0000-000000000001",
    }),
    (error) => error.code === "EVENT_LINEAGE_NOT_FOUND" && error.status === 400,
  );
});
